use rusqlite::Connection;
use std::path::Path;

use crate::{e, Res};

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

pub fn run_column_migrations(conn: &Connection) -> Res<()> {
    ensure_table_columns(conn, "local_sources", &LOCAL_SOURCE_COLUMNS)?;
    ensure_table_columns(conn, "user_features", &USER_FEATURE_COLUMNS)?;
    Ok(())
}
