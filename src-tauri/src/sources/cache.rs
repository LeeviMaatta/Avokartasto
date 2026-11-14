use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

use crate::{e, Db, Res};

#[derive(Clone)]
pub struct TileSourceMeta {
    pub base_path: String,
    pub pattern: String,
    pub url: String,
    pub auth: String,
}

static SOURCE_META_CACHE: OnceLock<Mutex<HashMap<i64, TileSourceMeta>>> = OnceLock::new();

pub fn invalidate_source_meta_cache() {
    if let Some(cache) = SOURCE_META_CACHE.get() {
        if let Ok(mut map) = cache.lock() {
            map.clear();
        }
    }
}

pub fn get_source_meta(app: &AppHandle, id: i64) -> Res<TileSourceMeta> {
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
