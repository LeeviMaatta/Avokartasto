use keyring::{Entry, Error as KeyringError};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Component, Path},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{http::Response, AppHandle, Manager, State};

pub struct Db(pub Mutex<Connection>);

#[derive(Clone)]
struct TileSourceMeta {
    base_path: String,
    pattern: String,
    url: String,
    auth: String,
}

type CachedTile = (Instant, Vec<u8>);
static REMOTE_TILE_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static REMOTE_TILE_CACHE: OnceLock<Mutex<HashMap<String, CachedTile>>> = OnceLock::new();
static MBTILES_CACHE: OnceLock<Mutex<HashMap<String, Arc<Mutex<Connection>>>>> = OnceLock::new();
static SECRET_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
static SOURCE_META_CACHE: OnceLock<Mutex<HashMap<i64, TileSourceMeta>>> = OnceLock::new();
static TILE_CACHE_ENABLED: OnceLock<Mutex<Option<bool>>> = OnceLock::new();

fn invalidate_source_meta_cache() {
    if let Some(cache) = SOURCE_META_CACHE.get() {
        if let Ok(mut map) = cache.lock() {
            map.clear();
        }
    }
}

fn invalidate_tile_cache_setting() {
    if let Some(flag) = TILE_CACHE_ENABLED.get() {
        if let Ok(mut val) = flag.lock() {
            *val = None;
        }
    }
}

fn get_source_meta(app: &AppHandle, id: i64) -> Res<TileSourceMeta> {
    let cache = SOURCE_META_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(map) = cache.lock() {
        if let Some(meta) = map.get(&id) {
            return Ok(meta.clone());
        }
    }
    let db = app.try_state::<Db>().ok_or("tietokanta ei valmis")?;
    let meta = {
        let c = db.0.lock().map_err(e)?;
        c.query_row(
            "SELECT COALESCE(base_path,''), COALESCE(pattern,''), COALESCE(url,''), COALESCE(auth,'') FROM local_sources WHERE id = ?1",
            [id],
            |r| {
                Ok(TileSourceMeta {
                    base_path: r.get(0)?,
                    pattern: r.get(1)?,
                    url: r.get(2)?,
                    auth: r.get(3)?,
                })
            },
        )
        .map_err(e)?
    };
    if let Ok(mut map) = cache.lock() {
        map.insert(id, meta.clone());
    }
    Ok(meta)
}

fn is_tile_cache_enabled(app: &AppHandle) -> bool {
    let cache = TILE_CACHE_ENABLED.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some(enabled) = *guard {
            return enabled;
        }
    }
    let enabled = app
        .try_state::<Db>()
        .and_then(|db| {
            let c = db.0.lock().ok()?;
            let val: Option<String> = c
                .query_row("SELECT value FROM settings WHERE key='tileCache'", [], |r| r.get(0))
                .optional()
                .ok()?;
            Some(val.as_deref() != Some("0"))
        })
        .unwrap_or(true);
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(enabled);
    }
    enabled
}

fn remote_tile_client() -> &'static reqwest::blocking::Client {
    REMOTE_TILE_CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Karttasovellus/0.1")
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new())
    })
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS local_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_path TEXT NOT NULL,
    pattern TEXT NOT NULL,
    projection TEXT DEFAULT 'EPSG:3857',
    role TEXT NOT NULL DEFAULT 'basemap',
    opacity REAL NOT NULL DEFAULT 1.0,
    max_zoom INTEGER NOT NULL DEFAULT 19,
    attribution TEXT NOT NULL DEFAULT ''
    ,api_type TEXT NOT NULL DEFAULT 'tile'
    ,tile_size INTEGER NOT NULL DEFAULT 256
    ,layer_name TEXT NOT NULL DEFAULT ''
    ,style TEXT NOT NULL DEFAULT ''
    ,builtin_key TEXT UNIQUE
    ,is_default INTEGER NOT NULL DEFAULT 0
    ,factory_json TEXT
    ,kind TEXT NOT NULL DEFAULT 'raster'
    ,url TEXT NOT NULL DEFAULT ''
    ,min_zoom INTEGER NOT NULL DEFAULT 0
    ,params TEXT NOT NULL DEFAULT '{}'
    ,auth TEXT NOT NULL DEFAULT ''
    ,note TEXT NOT NULL DEFAULT ''
    ,view_zoom_offset INTEGER NOT NULL DEFAULT 0
    ,view_magnification INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS user_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    feature_type TEXT NOT NULL,
    geojson TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    folder_id TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#dc2626',
    image_data TEXT
);
";
const KEYRING_SERVICE: &str = "fi.example.karttasovellus";
const SECRET_KEYS: [&str; 4] = [
    "mmlKey",
    "lantmaterietUsername",
    "lantmaterietPassword",
    "owmKey",
];

type Res<T> = Result<T, String>;
fn e<E: ToString>(x: E) -> String {
    x.to_string()
}

fn is_secret_key(key: &str) -> bool {
    SECRET_KEYS.contains(&key)
}

fn keyring_entry(key: &str) -> Res<Entry> {
    Entry::new(KEYRING_SERVICE, key).map_err(e)
}

fn set_secret(key: &str, value: &str) -> Res<()> {
    let entry = keyring_entry(key)?;
    let res = if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry.set_password(value).map_err(e)
    };
    if res.is_ok() {
        let cache = SECRET_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(mut map) = cache.lock() {
            map.insert(
                key.to_string(),
                if value.is_empty() { None } else { Some(value.to_string()) },
            );
        }
    }
    res
}

fn get_secret(key: &str) -> Res<Option<String>> {
    let cache = SECRET_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(map) = cache.lock() {
        if let Some(cached) = map.get(key) {
            return Ok(cached.clone());
        }
    }
    let fetched = match keyring_entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }?;
    if let Ok(mut map) = cache.lock() {
        map.insert(key.to_string(), fetched.clone());
    }
    Ok(fetched)
}

fn validate_setting(key: &str, value: &str) -> Res<()> {
    if key.is_empty() || key.len() > 128 {
        return Err("Virheellinen asetuksen avain".into());
    }
    if value.len() > 64 * 1024 {
        return Err("Asetuksen arvo on liian suuri".into());
    }
    Ok(())
}

fn validate_source(
    name: &str,
    base_path: &str,
    pattern: &str,
    role: &str,
    opacity: f64,
    max_zoom: i64,
    api_type: &str,
    tile_size: i64,
) -> Res<()> {
    if name.trim().is_empty() {
        return Err("Karttatason nimi on pakollinen".into());
    }
    if !matches!(role, "basemap" | "overlay") {
        return Err("Virheellinen karttatason rooli".into());
    }
    if !matches!(
        api_type,
        "tile" | "local_tile" | "xyz" | "wmts" | "wms" | "vector_tile" | "wfs"
            | "geojson" | "gpx" | "kml" | "shapefile" | "img"
    ) {
        return Err("Karttatason rajapintatyyppiä ei tueta".into());
    }
    if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
        return Err("Virheellinen karttatason läpinäkyvyys".into());
    }
    if !(0..=24).contains(&max_zoom) || !(64..=2048).contains(&tile_size) {
        return Err("Karttatason zoom- tai laattakoko on virheellinen".into());
    }
    if matches!(api_type, "tile" | "local_tile" | "shapefile" | "img") {
        if base_path.trim().is_empty() || pattern.trim().is_empty() {
            return Err("Paikallisen lähteen polku ja laattamalli ovat pakollisia".into());
        }
        let pattern_path = Path::new(pattern);
        if pattern_path.is_absolute()
            || pattern_path
                .components()
                .any(|component| component == Component::ParentDir)
        {
            return Err("Laatan polun on oltava suhteellinen eikä se saa sisältää '..' -osia".into());
        }
    }
    Ok(())
}

fn validate_feature(feature_type: &str, geojson: &str) -> Res<()> {
    let value: serde_json::Value = serde_json::from_str(geojson)
        .map_err(|_| "Merkinnän geometria ei ole kelvollista JSONia".to_string())?;
    let expected_type = match feature_type {
        "POINT" => "Point",
        "LINESTRING" => "LineString",
        "POLYGON" => "Polygon",
        _ => return Err("Virheellinen merkinnän tyyppi".into()),
    };
    let coordinates = value.get("coordinates");
    if value.get("type").and_then(serde_json::Value::as_str) != Some(expected_type)
        || !coordinates.is_some_and(serde_json::Value::is_array)
        || (expected_type == "Point"
            && coordinates
                .and_then(serde_json::Value::as_array)
                .is_some_and(Vec::is_empty))
    {
        return Err("Merkinnän geometria ei vastaa ilmoitettua tyyppiä".into());
    }
    Ok(())
}

fn migrate_secret_settings(conn: &Connection) -> Res<()> {
    for key in SECRET_KEYS {
        let value = conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(e)?;
        if let Some(value) = value {
            if !value.is_empty() {
                keyring_entry(key)?.set_password(&value).map_err(e)?;
            }
            conn.execute("DELETE FROM settings WHERE key = ?1", [key])
                .map_err(e)?;
        }
    }
    Ok(())
}

fn ensure_local_source_column(conn: &Connection, name: &str, definition: &str) -> Res<()> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('local_sources') WHERE name = ?1)",
            [name],
            |row| row.get(0),
        )
        .map_err(e)?;
    if !exists {
        conn.execute(
            &format!("ALTER TABLE local_sources ADD COLUMN {name} {definition}"),
            [],
        )
        .map_err(e)?;
    }

    Ok(())
}

fn ensure_user_feature_column(conn: &Connection, name: &str, definition: &str) -> Res<()> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('user_features') WHERE name = ?1)",
            [name],
            |row| row.get(0),
        )
        .map_err(e)?;
    if !exists {
        conn.execute(
            &format!("ALTER TABLE user_features ADD COLUMN {name} {definition}"),
            [],
        )
        .map_err(e)?;
    }
    Ok(())
}

fn seed_default_sources(conn: &Connection) -> Res<()> {
    conn.execute(
        "UPDATE settings SET value = (SELECT 'src:' || id FROM local_sources WHERE builtin_key = 'osm' LIMIT 1)
         WHERE key = 'basemap' AND value IN (
             SELECT 'src:' || id FROM local_sources WHERE builtin_key IN ('carto-light', 'carto-dark', 'carto-voyager')
         )",
        [],
    )
    .ok();

    conn.execute(
        "DELETE FROM local_sources WHERE builtin_key IN (
            'carto-light', 'carto-dark', 'carto-voyager',
            'mml-kuntarajat', 'mml-paikannimet', 'mml-hydrografia',
            'mml-rinnevarjoste', 'mml-korkeusvyohykkeet', 'mml-orto-infra'
        )",
        [],
    )
    .map_err(e)?;

    conn.execute(
        "UPDATE local_sources SET max_zoom = 11 WHERE builtin_key LIKE 'owm-%' AND max_zoom > 11",
        [],
    )
    .ok();

    let manifest = include_str!("../resources/default_maps.json");
    let defaults: Vec<serde_json::Value> = serde_json::from_str(manifest).map_err(e)?;
    for source in defaults {
        let builtin_key = source
            .get("builtin_key")
            .and_then(serde_json::Value::as_str)
            .ok_or("Oletuslähteeltä puuttuu builtin_key")?;
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_sources WHERE builtin_key=?1)",
                [builtin_key],
                |row| row.get(0),
            )
            .map_err(e)?;
        if exists {
            continue;
        }
        let api_type = source.get("api_type").and_then(serde_json::Value::as_str).unwrap_or("xyz");
        conn.execute(
            "INSERT INTO local_sources
             (name,base_path,pattern,projection,role,opacity,max_zoom,attribution,api_type,
              tile_size,layer_name,style,builtin_key,is_default,factory_json,kind,url,params,auth,note)
             VALUES (?1,'','{z}/{x}/{y}.png','EPSG:3857',?2,?3,?4,?5,?6,256,'','',?7,1,?8,?9,?10,?11,?12,?13)",
            params![
                source.get("name").and_then(serde_json::Value::as_str).unwrap_or("Karttataso"),
                source.get("role").and_then(serde_json::Value::as_str).unwrap_or("overlay"),
                source.get("opacity").and_then(serde_json::Value::as_f64).unwrap_or(1.0),
                source.get("max_zoom").and_then(serde_json::Value::as_i64).unwrap_or(19),
                source.get("attribution").and_then(serde_json::Value::as_str).unwrap_or(""),
                api_type,
                builtin_key,
                source.to_string(),
                source_kind(api_type),
                source.get("url").and_then(serde_json::Value::as_str).unwrap_or(""),
                source.get("params").map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string())).unwrap_or_else(|| "{}".into()),
                source.get("auth").and_then(serde_json::Value::as_str).unwrap_or(""),
                source.get("note").and_then(serde_json::Value::as_str).unwrap_or("")
            ],
        )
        .map_err(e)?;
    }
    Ok(())
}

fn seed_default_layer_groups(conn: &Connection) -> Res<()> {
    let seeded: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'defaultLayerGroupsSeeded'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?;
    if seeded.as_deref() == Some("1") {
        return Ok(());
    }

    let raw_groups: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'layerGroups'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?;
    let mut groups: Vec<serde_json::Value> = raw_groups
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    for (id, name) in [
        ("grp-esri", "ESRI"),
        ("grp-mml", "MML"),
        ("grp-owm", "OpenWeatherMap"),
        ("grp-orm", "OpenRailwayMap"),
    ] {
        let has_group = groups
            .iter()
            .any(|g| g.get("id").and_then(serde_json::Value::as_str) == Some(id));
        if !has_group {
            groups.push(serde_json::json!({ "id": id, "name": name }));
        }
    }

    let raw_map: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'layerGroupMap'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?;
    let mut group_map: serde_json::Map<String, serde_json::Value> = raw_map
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let mut stmt = conn
        .prepare("SELECT id, builtin_key FROM local_sources WHERE builtin_key IS NOT NULL")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(e)?;

    for row in rows {
        let (id, builtin_key) = row.map_err(e)?;
        let group_id = if builtin_key.starts_with("esri-") {
            Some("grp-esri")
        } else if builtin_key.starts_with("mml-") {
            Some("grp-mml")
        } else if builtin_key.starts_with("owm-") {
            Some("grp-owm")
        } else if builtin_key == "orm" || builtin_key.starts_with("orm-") {
            Some("grp-orm")
        } else {
            None
        };
        if let Some(gid) = group_id {
            group_map
                .entry(format!("src:{id}"))
                .or_insert_with(|| serde_json::Value::String(gid.to_string()));
        }
    }

    let groups_json = serde_json::to_string(&groups).map_err(e)?;
    let map_json = serde_json::to_string(&group_map).map_err(e)?;
    for (key, value) in [
        ("layerGroups", groups_json.as_str()),
        ("layerGroupMap", map_json.as_str()),
        ("defaultLayerGroupsSeeded", "1"),
    ] {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(e)?;
    }
    Ok(())
}

#[derive(Serialize)]
struct LocalSource {
    id: i64,
    name: String,
    base_path: String,
    pattern: String,
    projection: String,
    role: String,
    opacity: f64,
    max_zoom: i64,
    attribution: String,
    api_type: String,
    tile_size: i64,
    layer_name: String,
    style: String,
    builtin_key: Option<String>,
    is_default: bool,
    factory_json: Option<String>,
    kind: String,
    url: String,
    min_zoom: i64,
    params: String,
    auth: String,
    note: String,
    view_zoom_offset: i64,
    view_magnification: i64,
}

#[derive(Deserialize)]
struct SourceInput {
    name: String,
    base_path: String,
    pattern: String,
    projection: String,
    role: String,
    opacity: f64,
    min_zoom: i64,
    max_zoom: i64,
    attribution: String,
    api_type: String,
    tile_size: i64,
    layer_name: String,
    style: String,
    url: String,
    params: String,
    auth: String,
    note: String,
    view_zoom_offset: i64,
    view_magnification: i64,
}

fn source_kind(api_type: &str) -> &'static str {
    match api_type {
        "vector_tile" => "vector",
        "wfs" | "geojson" | "gpx" | "kml" | "shapefile" => "features",
        _ => "raster",
    }
}

#[derive(Serialize)]
struct UserFeature {
    id: i64,
    title: String,
    description: Option<String>,
    feature_type: String,
    geojson: String,
    created_at: String,
    folder_id: String,
    color: String,
    image_data: Option<String>,
}

// ---------- Asetukset ----------
#[tauri::command]
fn get_settings(db: State<Db>) -> Res<HashMap<String, String>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c.prepare("SELECT key, value FROM settings").map_err(e)?;
    let rows = s
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(e)?;
    let mut settings = rows.collect::<Result<HashMap<_, _>, _>>().map_err(e)?;
    drop(s);
    drop(c);
    for key in SECRET_KEYS {
        if let Some(value) = get_secret(key)? {
            settings.insert(key.to_string(), value);
        }
    }
    Ok(settings)
}

#[tauri::command]
fn set_setting(db: State<Db>, key: String, value: String) -> Res<()> {
    validate_setting(&key, &value)?;
    if is_secret_key(&key) {
        return set_secret(&key, &value);
    }
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(e)?;
    drop(c);
    if key == "tileCache" {
        invalidate_tile_cache_setting();
    }
    Ok(())
}

#[tauri::command]
fn set_settings(db: State<Db>, settings: HashMap<String, String>) -> Res<()> {
    for (key, value) in &settings {
        validate_setting(key, value)?;
    }
    let secrets = settings
        .iter()
        .filter(|(key, _)| is_secret_key(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Vec<_>>();
    let mut c = db.0.lock().map_err(e)?;
    let tx = c.transaction().map_err(e)?;
    for (key, value) in settings {
        if is_secret_key(&key) {
            continue;
        }
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(e)?;
    }
    tx.commit().map_err(e)?;
    drop(c);
    invalidate_tile_cache_setting();
    for (key, value) in secrets {
        set_secret(&key, &value)?;
    }
    Ok(())
}

// ---------- Paikalliset lähteet ----------
#[tauri::command]
fn list_sources(db: State<Db>) -> Res<Vec<LocalSource>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c
        .prepare(
            "SELECT id, name, base_path, pattern, COALESCE(projection,'EPSG:3857'),
                  COALESCE(role,'basemap'), COALESCE(opacity,1.0), COALESCE(max_zoom,19),
                  COALESCE(attribution,''), COALESCE(api_type,'tile'), COALESCE(tile_size,256),
                  COALESCE(layer_name,''), COALESCE(style,''), builtin_key,
                  COALESCE(is_default,0), factory_json, COALESCE(kind,'raster'),
                  COALESCE(url,''), COALESCE(min_zoom,0), COALESCE(params,'{}'),
                  COALESCE(auth,''), COALESCE(note,''), COALESCE(view_zoom_offset,0),
                  COALESCE(view_magnification,1) FROM local_sources ORDER BY id",
        )
        .map_err(e)?;
    let rows = s
        .query_map([], |r| {
            Ok(LocalSource {
                id: r.get(0)?,
                name: r.get(1)?,
                base_path: r.get(2)?,
                pattern: r.get(3)?,
                projection: r.get(4)?,
                role: r.get(5)?,
                opacity: r.get(6)?,
                max_zoom: r.get(7)?,
                attribution: r.get(8)?,
                api_type: r.get(9)?,
                tile_size: r.get(10)?,
                layer_name: r.get(11)?,
                style: r.get(12)?,
                builtin_key: r.get(13)?,
                is_default: r.get::<_, i64>(14)? != 0,
                factory_json: r.get(15)?,
                kind: r.get(16)?,
                url: r.get(17)?,
                min_zoom: r.get(18)?,
                params: r.get(19)?,
                auth: r.get(20)?,
                note: r.get(21)?,
                view_zoom_offset: r.get(22)?,
                view_magnification: r.get(23)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(e)
}

#[tauri::command]
fn add_source(
    db: State<Db>,
    name: String,
    base_path: String,
    pattern: String,
    role: String,
    opacity: f64,
    max_zoom: i64,
    attribution: String,
    api_type: String,
    tile_size: i64,
    layer_name: String,
    style: String,
) -> Res<i64> {
    validate_source(
        &name, &base_path, &pattern, &role, opacity, max_zoom, &api_type, tile_size,
    )?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO local_sources (name, base_path, pattern, role, opacity, max_zoom, attribution, api_type, tile_size, layer_name, style)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![name, base_path, pattern, role, opacity, max_zoom, attribution, api_type, tile_size, layer_name, style],
    )
    .map_err(e)?;
    let rowid = c.last_insert_rowid();
    drop(c);
    invalidate_source_meta_cache();
    Ok(rowid)
}

#[tauri::command]
fn delete_source(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    let is_default: bool = c
        .query_row(
            "SELECT COALESCE(is_default,0) != 0 FROM local_sources WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?
        .unwrap_or(false);
    if is_default {
        return Err("Oletuslähdettä ei voi poistaa".into());
    }
    c.execute("DELETE FROM local_sources WHERE id = ?1", params![id])
        .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

#[tauri::command]
fn add_source_config(db: State<Db>, source: SourceInput) -> Res<i64> {
    validate_source(
        &source.name,
        &source.base_path,
        &source.pattern,
        &source.role,
        source.opacity,
        source.max_zoom,
        &source.api_type,
        source.tile_size,
    )?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO local_sources
         (name, base_path, pattern, projection, role, opacity, min_zoom, max_zoom, attribution,
          api_type, tile_size, layer_name, style, kind, url, params, auth, note,
          view_zoom_offset, view_magnification)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
        params![
            source.name, source.base_path, source.pattern, source.projection, source.role,
            source.opacity, source.min_zoom, source.max_zoom, source.attribution,
            source.api_type, source.tile_size, source.layer_name, source.style,
            source_kind(&source.api_type), source.url, source.params, source.auth, source.note,
            source.view_zoom_offset, source.view_magnification
        ],
    )
    .map_err(e)?;
    let rowid = c.last_insert_rowid();
    drop(c);
    invalidate_source_meta_cache();
    Ok(rowid)
}

#[tauri::command]
fn update_source_config(db: State<Db>, id: i64, source: SourceInput) -> Res<()> {
    validate_source(
        &source.name,
        &source.base_path,
        &source.pattern,
        &source.role,
        source.opacity,
        source.max_zoom,
        &source.api_type,
        source.tile_size,
    )?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "UPDATE local_sources SET name=?1,base_path=?2,pattern=?3,projection=?4,role=?5,
         opacity=?6,min_zoom=?7,max_zoom=?8,attribution=?9,api_type=?10,tile_size=?11,
         layer_name=?12,style=?13,kind=?14,url=?15,params=?16,auth=?17,note=?18,
         view_zoom_offset=?19,view_magnification=?20 WHERE id=?21",
        params![
            source.name, source.base_path, source.pattern, source.projection, source.role,
            source.opacity, source.min_zoom, source.max_zoom, source.attribution,
            source.api_type, source.tile_size, source.layer_name, source.style,
            source_kind(&source.api_type), source.url, source.params, source.auth, source.note,
            source.view_zoom_offset, source.view_magnification, id
        ],
    )
    .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

#[tauri::command]
fn reset_source_to_default(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    let factory: String = c
        .query_row("SELECT factory_json FROM local_sources WHERE id=?1 AND is_default=1", [id], |row| row.get(0))
        .map_err(e)?;
    let value: serde_json::Value = serde_json::from_str(&factory).map_err(e)?;
    let text = |key: &str| value.get(key).and_then(serde_json::Value::as_str).unwrap_or("");
    let params_str = value
        .get("params")
        .map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))
        .unwrap_or_else(|| "{}".into());
    c.execute(
        "UPDATE local_sources SET name=?1,role=?2,api_type=?3,url=?4,attribution=?5,
         max_zoom=?6,opacity=?7,params=?8,auth=?9,note=?10,kind=?11,
         base_path='',pattern='{z}/{x}/{y}.png',min_zoom=0,tile_size=256,
         layer_name='',style='',view_zoom_offset=0,view_magnification=1 WHERE id=?12",
        params![
            text("name"), text("role"), text("api_type"), text("url"), text("attribution"),
            value.get("max_zoom").and_then(serde_json::Value::as_i64).unwrap_or(19),
            value.get("opacity").and_then(serde_json::Value::as_f64).unwrap_or(1.0),
            params_str, text("auth"), text("note"), source_kind(text("api_type")), id
        ],
    )
    .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

#[tauri::command]
fn update_source(
    db: State<Db>,
    id: i64,
    name: String,
    base_path: String,
    pattern: String,
    role: String,
    opacity: f64,
    max_zoom: i64,
    attribution: String,
    api_type: String,
    tile_size: i64,
    layer_name: String,
    style: String,
) -> Res<()> {
    validate_source(
        &name, &base_path, &pattern, &role, opacity, max_zoom, &api_type, tile_size,
    )?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "UPDATE local_sources
         SET name = ?1, base_path = ?2, pattern = ?3, role = ?4,
             opacity = ?5, max_zoom = ?6, attribution = ?7, api_type = ?8,
             tile_size = ?9, layer_name = ?10, style = ?11
         WHERE id = ?12",
        params![
            name,
            base_path,
            pattern,
            role,
            opacity,
            max_zoom,
            attribution,
            api_type,
            tile_size,
            layer_name,
            style,
            id
        ],
    )
    .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

fn read_remote_tile(app: &AppHandle, path: &str) -> Res<(Vec<u8>, &'static str)> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 4 {
        return Err("virheellinen etälaatan polku".into());
    }
    let source_id: i64 = parts[0].parse().map_err(e)?;
    let z: u32 = parts[1].parse().map_err(e)?;
    let x: u32 = parts[2].parse().map_err(e)?;
    let y: u32 = parts[3].split('.').next().unwrap_or("").parse().map_err(e)?;
    validate_tile_coordinates(z, x, y)?;
    let meta = get_source_meta(app, source_id)?;
    let cache_enabled = is_tile_cache_enabled(app);
    let template = meta.url;
    let auth = meta.auth;
    if template.is_empty() {
        return Err("Karttalähteen URL puuttuu".into());
    }
    let mut url = template
        .replace("{z}", &z.to_string())
        .replace("{x}", &x.to_string())
        .replace("{y}", &y.to_string());
    for key in SECRET_KEYS {
        let token = format!("{{secret:{key}}}");
        if url.contains(&token) {
            url = url.replace(&token, &get_secret(key)?.unwrap_or_default());
        }
    }

    let cache = REMOTE_TILE_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if cache_enabled {
        if let Ok(mut entries) = cache.lock() {
            if let Some((created, bytes)) = entries.get(&url) {
                if created.elapsed() < Duration::from_secs(300) {
                    let cloned = bytes.clone();
                    let mime = mime_of(&cloned);
                    return Ok((cloned, mime));
                }
            }
            entries.retain(|_, (created, _)| created.elapsed() < Duration::from_secs(600));
        }
    }

    let client = remote_tile_client();
    let request = client.get(&url);
    let request = if let Ok(value) = serde_json::from_str::<serde_json::Value>(&auth) {
        match (
            value.get("username").and_then(serde_json::Value::as_str),
            value.get("password").and_then(serde_json::Value::as_str),
        ) {
            (Some(username), Some(password)) => request.basic_auth(
                get_secret(username)?.unwrap_or_default(),
                Some(get_secret(password)?.unwrap_or_default()),
            ),
            _ => request,
        }
    } else {
        request
    };
    let response = request.send().map_err(e)?;
    if !response.status().is_success() {
        return Err(format!("Etäpalvelin palautti HTTP {}", response.status()));
    }
    let bytes = response.bytes().map_err(e)?.to_vec();
    let mime = mime_of(&bytes);
    if cache_enabled {
        if let Ok(mut entries) = cache.lock() {
            if entries.len() >= 512 {
                entries.clear();
            }
            entries.insert(url, (Instant::now(), bytes.clone()));
        }
    }
    Ok((bytes, mime))
}

// ---------- Merkinnät ja mittaukset ----------
#[tauri::command]
fn list_features(db: State<Db>) -> Res<Vec<UserFeature>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c
        .prepare("SELECT id, title, description, feature_type, geojson, COALESCE(created_at,''), COALESCE(folder_id,''), COALESCE(color,'#dc2626'), image_data FROM user_features ORDER BY id DESC")
        .map_err(e)?;
    let rows = s
        .query_map([], |r| {
            Ok(UserFeature {
                id: r.get(0)?,
                title: r.get(1)?,
                description: r.get(2)?,
                feature_type: r.get(3)?,
                geojson: r.get(4)?,
                created_at: r.get(5)?,
                folder_id: r.get(6)?,
                color: r.get(7)?,
                image_data: r.get(8)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(e)
}

#[tauri::command]
fn add_feature(
    db: State<Db>,
    title: String,
    description: Option<String>,
    feature_type: String,
    geojson: String,
    folder_id: String,
    color: String,
    image_data: Option<String>,
) -> Res<i64> {
    validate_feature(&feature_type, &geojson)?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO user_features (title, description, feature_type, geojson, folder_id, color, image_data) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![title, description, feature_type, geojson, folder_id, color, image_data],
    )
    .map_err(e)?;
    Ok(c.last_insert_rowid())
}

#[tauri::command]
fn delete_feature(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    c.execute("DELETE FROM user_features WHERE id = ?1", params![id])
        .map_err(e)?;
    Ok(())
}

#[tauri::command]
fn update_feature(
    db: State<Db>,
    id: i64,
    title: String,
    description: Option<String>,
    feature_type: String,
    geojson: String,
    folder_id: String,
    color: String,
    image_data: Option<String>,
) -> Res<()> {
    validate_feature(&feature_type, &geojson)?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "UPDATE user_features SET title = ?1, description = ?2, feature_type = ?3, geojson = ?4, folder_id = ?5, color = ?6, image_data = ?7 WHERE id = ?8",
        params![title, description, feature_type, geojson, folder_id, color, image_data, id],
    )
    .map_err(e)?;
    Ok(())
}

// ---------- app-tile:// -protokolla ----------
fn mime_of(b: &[u8]) -> &'static str {
    if b.starts_with(&[0x89, 0x50]) {
        "image/png"
    } else if b.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if b.starts_with(b"RIFF") {
        "image/webp"
    } else {
        "image/png"
    }
}

fn parse_tile_path(path: &str) -> Res<(i64, u32, u32, u32)> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 4 {
        return Err("virheellinen polku".into());
    }
    let id: i64 = parts[0].parse().map_err(e)?;
    let z: u32 = parts[1].parse().map_err(e)?;
    let x: u32 = parts[2].parse().map_err(e)?;
    let y: u32 = parts[3]
        .split('.')
        .next()
        .unwrap_or("")
        .parse()
        .map_err(e)?;
    validate_tile_coordinates(z, x, y)?;
    Ok((id, z, x, y))
}

fn validate_tile_coordinates(z: u32, x: u32, y: u32) -> Res<()> {
    if z > 31 {
        return Err("zoom-arvo on liian suuri".into());
    }
    let limit = 1u32 << z;
    if x >= limit || y >= limit {
        return Err("laatan koordinaatit eivät kuulu zoom-tasolle".into());
    }
    Ok(())
}

fn read_tile(app: &AppHandle, path: &str) -> Result<(Vec<u8>, &'static str), String> {
    let (id, z, x, y) = parse_tile_path(path)?;
    let flipped = (1u32 << z) - 1 - y;

    let meta = get_source_meta(app, id)?;
    let base = meta.base_path;
    let pattern = meta.pattern;

    let bytes = if base.to_lowercase().ends_with(".mbtiles") {
        let pool = MBTILES_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let conn_arc = {
            let mut map = pool.lock().map_err(e)?;
            if let Some(existing) = map.get(&base) {
                Arc::clone(existing)
            } else {
                if map.len() >= 16 {
                    map.clear();
                }
                let conn = Connection::open_with_flags(&base, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
                let arc = Arc::new(Mutex::new(conn));
                map.insert(base.clone(), Arc::clone(&arc));
                arc
            }
        };
        let conn = conn_arc.lock().map_err(e)?;
        conn.query_row(
            "SELECT tile_data FROM tiles WHERE zoom_level=?1 AND tile_column=?2 AND tile_row=?3",
            params![z, x, flipped],
            |r| r.get::<_, Vec<u8>>(0),
        )
        .map_err(e)?
    } else {
        let rel = pattern
            .replace("{z}", &z.to_string())
            .replace("{x}", &x.to_string())
            .replace("{-y}", &flipped.to_string())
            .replace("{y}", &y.to_string());

        let paths: Vec<&str> = base
            .split(|c| c == ';' || c == '\n' || c == ',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let mut found = None;
        for p in paths {
            let full_path = Path::new(p).join(&rel);
            if let Ok(b) = std::fs::read(&full_path) {
                found = Some(b);
                break;
            }
        }
        found.ok_or_else(|| "Laattaa ei löytynyt mistään annetusta kansiosta".to_string())?
    };
    let mime = mime_of(&bytes);
    Ok((bytes, mime))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_tile_zoom_overflow_and_out_of_range_coordinates() {
        assert!(parse_tile_path("/1/32/0/0").is_err());
        assert!(parse_tile_path("/1/2/4/0").is_err());
        assert!(parse_tile_path("/1/2/0/4").is_err());
        assert!(parse_tile_path("/1/2/3/3").is_ok());
    }

    #[test]
    fn rejects_unsupported_source_types_and_parent_paths() {
        assert!(validate_source(
            "test",
            "C:\\tiles",
            "{z}/{x}/{y}.png",
            "overlay",
            1.0,
            19,
            "vector",
            256
        )
        .is_err());
        assert!(validate_source(
            "test",
            "C:\\tiles",
            "../{z}/{x}/{y}.png",
            "overlay",
            1.0,
            19,
            "tile",
            256
        )
        .is_err());
    }

    #[test]
    fn validates_feature_shape_and_type() {
        assert!(
            validate_feature("LINESTRING", r#"{"type":"LineString","coordinates":[]}"#).is_ok()
        );
        assert!(validate_feature("LINESTRING", r#"{"type":"Polygon","coordinates":[]}"#).is_err());
        assert!(validate_feature("POINT", r#"{"type":"Point","coordinates":[]}"#).is_err());
        assert!(validate_feature("LINESTRING", r#"{"type":"LineString"}"#).is_err());
        assert!(validate_feature("LINESTRING", "not-json").is_err());
    }
}

#[tauri::command]
fn save_export_file(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
    let safe_name = std::path::Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("mittaus.geojson");
    let downloads = app.path().download_dir().map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&downloads).map_err(|err| err.to_string())?;

    let mut target = downloads.join(safe_name);
    if target.exists() {
        let stem = target
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("mittaus")
            .to_string();
        let ext = target
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("geojson")
            .to_string();
        for i in 1..1000 {
            let candidate = downloads.join(format!("{stem} ({i}).{ext}"));
            if !candidate.exists() {
                target = candidate;
                break;
            }
        }
    }

    std::fs::write(&target, content.as_bytes()).map_err(|err| err.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("app-tile", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn_blocking(move || {
                let response = match read_tile(&app, &path) {
                    Ok((bytes, mime)) => Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap(),
                    Err(_) => Response::builder()
                        .status(404)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new())
                        .unwrap(),
                };
                responder.respond(response);
            });
        })
        .register_asynchronous_uri_scheme_protocol("remote-tile", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn_blocking(move || {
                let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
                if parts.len() != 4 {
                    responder.respond(Response::builder().status(400).body(Vec::new()).unwrap());
                    return;
                }
                let source_id = parts[0].parse::<i64>();
                let z = parts[1].parse::<u32>();
                let x = parts[2].parse::<u32>();
                let y = parts[3].split('.').next().unwrap_or("").parse::<i32>();
                let result = match (source_id, z, x, y) {
                    (Ok(_), Ok(_), Ok(_), Ok(_)) => read_remote_tile(&app, &path),
                    _ => Err("virheellinen etälaatan polku".into()),
                };
                let response = match result {
                    Ok((bytes, mime)) => Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap(),
                    Err(_) => Response::builder()
                        .status(502)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new())
                        .unwrap(),
                };
                responder.respond(response);
            });
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("app_data.db"))?;
            conn.execute_batch(SCHEMA)?;
            migrate_secret_settings(&conn).map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "role", "TEXT NOT NULL DEFAULT 'basemap'")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "opacity", "REAL NOT NULL DEFAULT 1.0")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "max_zoom", "INTEGER NOT NULL DEFAULT 19")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "attribution", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "api_type", "TEXT NOT NULL DEFAULT 'tile'")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "tile_size", "INTEGER NOT NULL DEFAULT 256")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "layer_name", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "style", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "builtin_key", "TEXT")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "is_default", "INTEGER NOT NULL DEFAULT 0")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "factory_json", "TEXT")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "kind", "TEXT NOT NULL DEFAULT 'raster'")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "url", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "min_zoom", "INTEGER NOT NULL DEFAULT 0")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "params", "TEXT NOT NULL DEFAULT '{}'")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "auth", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "note", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "view_zoom_offset", "INTEGER NOT NULL DEFAULT 0")
                .map_err(std::io::Error::other)?;
            ensure_local_source_column(&conn, "view_magnification", "INTEGER NOT NULL DEFAULT 1")
                .map_err(std::io::Error::other)?;
            ensure_user_feature_column(&conn, "folder_id", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_user_feature_column(&conn, "color", "TEXT NOT NULL DEFAULT '#dc2626'")
                .map_err(std::io::Error::other)?;
            ensure_user_feature_column(&conn, "image_data", "TEXT")
                .map_err(std::io::Error::other)?;
            seed_default_sources(&conn).map_err(std::io::Error::other)?;
            seed_default_layer_groups(&conn).map_err(std::io::Error::other)?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_setting,
            set_settings,
            list_sources,
            add_source,
            delete_source,
            update_source,
            add_source_config,
            update_source_config,
            reset_source_to_default,
            list_features,
            add_feature,
            update_feature,
            delete_feature,
            save_export_file
        ])
        .run(tauri::generate_context!())
        .expect("Tauri-sovelluksen käynnistys epäonnistui");
}
