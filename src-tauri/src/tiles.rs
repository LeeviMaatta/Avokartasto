use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

use crate::{
    e,
    secrets::{get_secret, SECRET_KEYS},
    sources::{get_source_meta, is_valid_http_url},
    Db, Res,
};

type CachedTile = (Instant, Vec<u8>);
static REMOTE_TILE_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static REMOTE_TILE_CACHE: OnceLock<Mutex<HashMap<String, CachedTile>>> = OnceLock::new();
static MBTILES_CACHE: OnceLock<Mutex<HashMap<String, Arc<Mutex<Connection>>>>> = OnceLock::new();
static TILE_CACHE_ENABLED: OnceLock<Mutex<Option<bool>>> = OnceLock::new();

pub fn invalidate_tile_cache_setting() {
    if let Some(flag) = TILE_CACHE_ENABLED.get() {
        if let Ok(mut val) = flag.lock() {
            *val = None;
        }
    }
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
            .user_agent("Avokartasto/1.0")
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new())
    })
}

pub fn mime_of(b: &[u8]) -> &'static str {
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

pub fn validate_tile_coordinates(z: u32, x: u32, y: u32) -> Res<()> {
    if z > 31 {
        return Err("zoom-arvo on liian suuri".into());
    }
    let limit = 1u32 << z;
    if x >= limit || y >= limit {
        return Err("laatan koordinaatit eivät kuulu zoom-tasolle".into());
    }
    Ok(())
}

pub fn parse_tile_path(path: &str) -> Res<(i64, u32, u32, u32)> {
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

fn evict_stale_or_oldest(entries: &mut HashMap<String, CachedTile>) {
    entries.retain(|_, (created, _)| created.elapsed() < Duration::from_secs(600));
    if entries.len() < 512 {
        return;
    }
    let mut keys_by_age: Vec<(String, Instant)> = entries
        .iter()
        .map(|(k, (created, _))| (k.clone(), *created))
        .collect();
    keys_by_age.sort_by_key(|(_, created)| *created);
    let remove_count = keys_by_age.len() / 2;
    for (key, _) in keys_by_age.into_iter().take(remove_count) {
        entries.remove(&key);
    }
}

pub fn read_remote_tile(app: &AppHandle, path: &str) -> Res<(Vec<u8>, &'static str)> {
    let (source_id, z, x, y) = parse_tile_path(path)?;
    let meta = get_source_meta(app, source_id)?;
    let cache_enabled = is_tile_cache_enabled(app);
    let template = meta.url;
    let auth = meta.auth;
    if template.trim().is_empty() {
        return Err("Karttalähteen URL puuttuu".into());
    }
    if !is_valid_http_url(&template) {
        return Err("Virheellinen etälähteen URL-protokolla".into());
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
            evict_stale_or_oldest(&mut entries);
            entries.insert(url, (Instant::now(), bytes.clone()));
        }
    }
    Ok((bytes, mime))
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_tile_zoom_overflow_and_out_of_range_coordinates() {
        assert!(parse_tile_path("/1/32/0/0").is_err());
        assert!(parse_tile_path("/1/2/4/0").is_err());
        assert!(parse_tile_path("/1/2/0/4").is_err());
        assert_eq!(parse_tile_path("/1/2/3/3.png").unwrap(), (1, 2, 3, 3));
    }

    #[test]
    fn evicts_oldest_half_when_remote_cache_is_full() {
        let mut cache = HashMap::new();
        let now = Instant::now();
        for i in 0..520 {
            cache.insert(format!("tile/{i}"), (now, vec![1, 2, 3]));
        }
        evict_stale_or_oldest(&mut cache);
        assert_eq!(cache.len(), 260);
    }
}
