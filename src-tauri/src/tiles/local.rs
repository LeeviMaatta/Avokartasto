use rusqlite::{params, Connection, OpenFlags};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
};
use tauri::AppHandle;

use super::path::{mime_of, parse_tile_path};
use crate::{e, sources::get_source_meta, Res};

static MBTILES_CACHE: OnceLock<Mutex<HashMap<String, Arc<Mutex<Connection>>>>> = OnceLock::new();

pub fn read_tile(app: &AppHandle, path: &str) -> Res<(Vec<u8>, &'static str)> {
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
                let conn = Connection::open_with_flags(&base, OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(e)?;
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
            .split([';', '\n', ','])
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
