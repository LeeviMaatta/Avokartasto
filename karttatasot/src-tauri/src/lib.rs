use keyring::{Entry, Error as KeyringError};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Component, Path},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{http::Response, AppHandle, Manager, State};

pub struct Db(pub Mutex<Connection>);

type CachedTile = (Instant, Vec<u8>);
static LANTMATERIET_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static LANTMATERIET_ASYNC_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static LANTMATERIET_CACHE: OnceLock<Mutex<HashMap<String, CachedTile>>> = OnceLock::new();

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
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry.set_password(value).map_err(e)
    }
}

fn get_secret(key: &str) -> Res<Option<String>> {
    match keyring_entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
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
    if name.trim().is_empty() || base_path.trim().is_empty() || pattern.trim().is_empty() {
        return Err("Karttatason nimi, polku ja laattamalli ovat pakollisia".into());
    }
    if !matches!(role, "basemap" | "overlay") {
        return Err("Virheellinen karttatason rooli".into());
    }
    if !matches!(api_type, "tile" | "wms") {
        return Err("Tuettuja rajapintatyyppejä ovat tile ja wms".into());
    }
    if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
        return Err("Virheellinen karttatason läpinäkyvyys".into());
    }
    if !(0..=24).contains(&max_zoom) || !(64..=2048).contains(&tile_size) {
        return Err("Karttatason zoom- tai laattakoko on virheellinen".into());
    }
    let pattern_path = Path::new(pattern);
    if pattern_path.is_absolute()
        || pattern_path
            .components()
            .any(|component| component == Component::ParentDir)
    {
        return Err("Laatan polun on oltava suhteellinen eikä se saa sisältää '..' -osia".into());
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
    if value.get("type").and_then(serde_json::Value::as_str) != Some(expected_type)
        || !value
            .get("coordinates")
            .is_some_and(serde_json::Value::is_array)
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
                  COALESCE(layer_name,''), COALESCE(style,'') FROM local_sources ORDER BY id",
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
    Ok(c.last_insert_rowid())
}

#[tauri::command]
fn delete_source(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    c.execute("DELETE FROM local_sources WHERE id = ?1", params![id])
        .map_err(e)?;
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
    Ok(())
}

#[tauri::command]
async fn fetch_lantmateriet_tile(_db: State<'_, Db>, z: u32, x: u32, y: i32) -> Res<Vec<u8>> {
    if y < 0 {
        return Err("laatan y-koordinaatti ei voi olla negatiivinen".into());
    }
    validate_tile_coordinates(z, x, y as u32)?;
    let username = get_secret("lantmaterietUsername")?.unwrap_or_default();
    let password = get_secret("lantmaterietPassword")?.unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        return Err("Lantmäteriet-tunnukset puuttuvat".into());
    }

    let url = format!(
        "https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts/1.0.0/topowebb/default/3857/{z}/{y}/{x}.png"
    );
    let cache = LANTMATERIET_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut entries) = cache.lock() {
        if let Some((created, bytes)) = entries.get(&url) {
            if created.elapsed() < Duration::from_secs(300) {
                return Ok(bytes.clone());
            }
        }
        entries.retain(|_, (created, _)| created.elapsed() < Duration::from_secs(600));
    }

    let client = LANTMATERIET_ASYNC_CLIENT.get_or_init(reqwest::Client::new);
    let response = client
        .get(&url)
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(e)?;
    if !response.status().is_success() {
        return Err(format!("Lantmäteriet palautti HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(e)?.to_vec();
    if let Ok(mut entries) = cache.lock() {
        if entries.len() >= 512 {
            entries.clear();
        }
        entries.insert(url, (Instant::now(), bytes.clone()));
    }
    Ok(bytes)
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

    let db = app.try_state::<Db>().ok_or("tietokanta ei valmis")?;
    let (base, pattern): (String, String) = {
        let c = db.0.lock().map_err(e)?;
        c.query_row(
            "SELECT base_path, pattern FROM local_sources WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(e)?
    };

    let bytes = if base.to_lowercase().ends_with(".mbtiles") {
        let conn =
            Connection::open_with_flags(&base, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
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

fn read_lantmateriet_tile(_app: &AppHandle, path: &str) -> Result<(Vec<u8>, &'static str), String> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 3 {
        return Err("virheellinen Lantmäteriet-laatan polku".into());
    }
    let z = parts[0];
    let x = parts[1];
    let y = parts[2].split('.').next().unwrap_or("");
    let username = get_secret("lantmaterietUsername")?.unwrap_or_default();
    let password = get_secret("lantmaterietPassword")?.unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        return Err("Lantmäteriet-tunnukset puuttuvat".into());
    }

    let url = format!(
        "https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts/1.0.0/topowebb/default/3857/{z}/{y}/{x}.png"
    );
    let cache = LANTMATERIET_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut entries) = cache.lock() {
        if let Some((created, bytes)) = entries.get(&url) {
            if created.elapsed() < Duration::from_secs(300) {
                return Ok((bytes.clone(), "image/png"));
            }
        }
        entries.retain(|_, (created, _)| created.elapsed() < Duration::from_secs(600));
    }

    let client = LANTMATERIET_CLIENT.get_or_init(reqwest::blocking::Client::new);
    let response = client
        .get(&url)
        .basic_auth(username, Some(password))
        .send()
        .map_err(e)?;
    if !response.status().is_success() {
        return Err(format!("Lantmäteriet palautti HTTP {}", response.status()));
    }
    let bytes = response.bytes().map_err(e)?.to_vec();
    if let Ok(mut entries) = cache.lock() {
        if entries.len() >= 512 {
            entries.clear();
        }
        entries.insert(url, (Instant::now(), bytes.clone()));
    }
    Ok((bytes, "image/png"))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("app-tile", |ctx, request| {
            match read_tile(ctx.app_handle(), request.uri().path()) {
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
            }
        })
        .register_uri_scheme_protocol("lantmateriet-tile", |ctx, request| {
            match read_lantmateriet_tile(ctx.app_handle(), request.uri().path()) {
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
            }
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
            ensure_user_feature_column(&conn, "folder_id", "TEXT NOT NULL DEFAULT ''")
                .map_err(std::io::Error::other)?;
            ensure_user_feature_column(&conn, "color", "TEXT NOT NULL DEFAULT '#dc2626'")
                .map_err(std::io::Error::other)?;
            ensure_user_feature_column(&conn, "image_data", "TEXT")
                .map_err(std::io::Error::other)?;
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
            fetch_lantmateriet_tile,
            list_features,
            add_feature,
            update_feature,
            delete_feature
        ])
        .run(tauri::generate_context!())
        .expect("Tauri-sovelluksen käynnistys epäonnistui");
}
