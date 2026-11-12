use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

use crate::{e, secrets::migrate_secret_settings, sources::source_kind, Res};

pub const SCHEMA: &str = "
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

const LOCAL_SOURCE_COLUMNS: [(&str, &str); 19] = [
    ("role", "TEXT NOT NULL DEFAULT 'basemap'"),
    ("opacity", "REAL NOT NULL DEFAULT 1.0"),
    ("max_zoom", "INTEGER NOT NULL DEFAULT 19"),
    ("attribution", "TEXT NOT NULL DEFAULT ''"),
    ("api_type", "TEXT NOT NULL DEFAULT 'tile'"),
    ("tile_size", "INTEGER NOT NULL DEFAULT 256"),
    ("layer_name", "TEXT NOT NULL DEFAULT ''"),
    ("style", "TEXT NOT NULL DEFAULT ''"),
    ("builtin_key", "TEXT"),
    ("is_default", "INTEGER NOT NULL DEFAULT 0"),
    ("factory_json", "TEXT"),
    ("kind", "TEXT NOT NULL DEFAULT 'raster'"),
    ("url", "TEXT NOT NULL DEFAULT ''"),
    ("min_zoom", "INTEGER NOT NULL DEFAULT 0"),
    ("params", "TEXT NOT NULL DEFAULT '{}'"),
    ("auth", "TEXT NOT NULL DEFAULT ''"),
    ("note", "TEXT NOT NULL DEFAULT ''"),
    ("view_zoom_offset", "INTEGER NOT NULL DEFAULT 0"),
    ("view_magnification", "INTEGER NOT NULL DEFAULT 1"),
];

const USER_FEATURE_COLUMNS: [(&str, &str); 3] = [
    ("folder_id", "TEXT NOT NULL DEFAULT ''"),
    ("color", "TEXT NOT NULL DEFAULT '#dc2626'"),
    ("image_data", "TEXT"),
];

pub fn migrate_legacy_data_dir(new_dir: &Path) {
    let target_db = new_dir.join("app_data.db");
    if target_db.exists() {
        return;
    }
    let Some(parent) = new_dir.parent() else {
        return;
    };
    for legacy_identifier in ["fi.karttasovellus.desktop", "fi.example.karttasovellus"] {
        let legacy_db = parent.join(legacy_identifier).join("app_data.db");
        if legacy_db.exists() {
            let _ = std::fs::copy(&legacy_db, &target_db);
            break;
        }
    }
}

fn ensure_table_columns(conn: &Connection, table: &str, columns: &[(&str, &str)]) -> Res<()> {
    for (name, definition) in columns {
        let query = format!("SELECT EXISTS(SELECT 1 FROM pragma_table_info('{table}') WHERE name = ?1)");
        let exists: bool = conn
            .query_row(&query, [name], |row| row.get(0))
            .map_err(e)?;
        if !exists {
            conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {name} {definition}"), [])
                .map_err(e)?;
        }
    }
    Ok(())
}

pub fn seed_default_sources(conn: &Connection) -> Res<()> {
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

    let google_migrated: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'googleTemplateMigrated'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?;

    let manifest = include_str!("../resources/default_maps.json");
    let defaults: Vec<serde_json::Value> = serde_json::from_str(manifest).map_err(e)?;
    for source in &defaults {
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
            if google_migrated.as_deref() != Some("1") && builtin_key.starts_with("g-") {
                let note = source.get("note").and_then(serde_json::Value::as_str).unwrap_or("");
                conn.execute(
                    "UPDATE local_sources
                     SET url = CASE WHEN url LIKE 'https://mt1.google.com/%' THEN '' ELSE url END,
                         note = CASE WHEN url LIKE 'https://mt1.google.com/%' THEN ?1 ELSE note END,
                         factory_json = ?2
                     WHERE builtin_key = ?3",
                    params![note, source.to_string(), builtin_key],
                )
                .map_err(e)?;
            }
            continue;
        }
        let api_type = source
            .get("api_type")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("xyz");
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
                source
                    .get("params")
                    .map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))
                    .unwrap_or_else(|| "{}".into()),
                source.get("auth").and_then(serde_json::Value::as_str).unwrap_or(""),
                source.get("note").and_then(serde_json::Value::as_str).unwrap_or("")
            ],
        )
        .map_err(e)?;
    }
    if google_migrated.as_deref() != Some("1") {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('googleTemplateMigrated', '1')
             ON CONFLICT(key) DO UPDATE SET value = '1'",
            [],
        )
        .map_err(e)?;
    }
    Ok(())
}

pub fn seed_default_layer_groups(conn: &Connection) -> Res<()> {
    let seeded: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'defaultLayerGroupsSeeded'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?;
    if seeded.as_deref() == Some("2") {
        return Ok(());
    }

    let raw_groups: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'layerGroups'", [], |row| row.get(0))
        .optional()
        .map_err(e)?;
    let mut groups: Vec<serde_json::Value> = raw_groups
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    groups.retain(|g| {
        let id = g.get("id").and_then(serde_json::Value::as_str);
        id != Some("grp-esri") && id != Some("grp-mml")
    });

    for (id, name, role) in [
        ("grp-esri-basemap", "ESRI", "basemap"),
        ("grp-esri-overlay", "ESRI", "overlay"),
        ("grp-mml-basemap", "MML", "basemap"),
        ("grp-mml-overlay", "MML", "overlay"),
        ("grp-owm", "OpenWeatherMap", "overlay"),
        ("grp-orm", "OpenRailwayMap", "overlay"),
    ] {
        if let Some(existing) = groups
            .iter_mut()
            .find(|g| g.get("id").and_then(serde_json::Value::as_str) == Some(id))
        {
            if let Some(obj) = existing.as_object_mut() {
                obj.entry("role".to_string())
                    .or_insert_with(|| serde_json::Value::String(role.to_string()));
            }
        } else {
            groups.push(serde_json::json!({ "id": id, "name": name, "role": role }));
        }
    }

    let raw_map: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'layerGroupMap'", [], |row| row.get(0))
        .optional()
        .map_err(e)?;
    let mut group_map: serde_json::Map<String, serde_json::Value> = raw_map
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let mut stmt = conn
        .prepare("SELECT id, builtin_key, role FROM local_sources WHERE builtin_key IS NOT NULL")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(e)?;

    for row in rows {
        let (id, builtin_key, role) = row.map_err(e)?;
        let group_id = if builtin_key.starts_with("esri-") {
            Some(if role == "overlay" { "grp-esri-overlay" } else { "grp-esri-basemap" })
        } else if builtin_key.starts_with("mml-") {
            Some(if role == "overlay" { "grp-mml-overlay" } else { "grp-mml-basemap" })
        } else if builtin_key.starts_with("owm-") {
            Some("grp-owm")
        } else if builtin_key == "orm" || builtin_key.starts_with("orm-") {
            Some("grp-orm")
        } else {
            None
        };
        if let Some(gid) = group_id {
            let key = format!("src:{id}");
            let current = group_map.get(&key).and_then(serde_json::Value::as_str);
            if current.is_none() || current == Some("grp-esri") || current == Some("grp-mml") {
                group_map.insert(key, serde_json::Value::String(gid.to_string()));
            }
        }
    }

    let groups_json = serde_json::to_string(&groups).map_err(e)?;
    let map_json = serde_json::to_string(&group_map).map_err(e)?;
    for (key, value) in [
        ("layerGroups", groups_json.as_str()),
        ("layerGroupMap", map_json.as_str()),
        ("defaultLayerGroupsSeeded", "2"),
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

pub fn initialize_db(conn: &Connection) -> Res<()> {
    conn.execute_batch(SCHEMA).map_err(e)?;
    migrate_secret_settings(conn)?;
    ensure_table_columns(conn, "local_sources", &LOCAL_SOURCE_COLUMNS)?;
    ensure_table_columns(conn, "user_features", &USER_FEATURE_COLUMNS)?;
    seed_default_sources(conn)?;
    seed_default_layer_groups(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initializes_schema_and_seeds_google_templates_without_urls() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_db(&conn).unwrap();

        let (url, note): (String, String) = conn
            .query_row(
                "SELECT url, note FROM local_sources WHERE builtin_key = 'g-sat'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(url, "");
        assert!(!note.is_empty());

        let mml_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM local_sources WHERE builtin_key LIKE 'mml-%'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(mml_count > 0);
    }

    #[test]
    fn migrates_legacy_google_url_once_without_clobbering_custom_url() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute(
            "INSERT INTO local_sources (name, base_path, pattern, builtin_key, url, note)
             VALUES ('Google Satelliitti', '', '{z}/{x}/{y}.png', 'g-sat', 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'old')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO local_sources (name, base_path, pattern, builtin_key, url, note)
             VALUES ('Google Hybridi', '', '{z}/{x}/{y}.png', 'g-hyb', 'https://custom.tiles.example/{z}/{x}/{y}.png', 'custom')",
            [],
        )
        .unwrap();

        seed_default_sources(&conn).unwrap();

        let g_sat_url: String = conn
            .query_row("SELECT url FROM local_sources WHERE builtin_key='g-sat'", [], |r| r.get(0))
            .unwrap();
        let g_hyb_url: String = conn
            .query_row("SELECT url FROM local_sources WHERE builtin_key='g-hyb'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(g_sat_url, "");
        assert_eq!(g_hyb_url, "https://custom.tiles.example/{z}/{x}/{y}.png");
    }
}
