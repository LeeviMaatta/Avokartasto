use rusqlite::OptionalExtension;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

use super::path::{mime_of, parse_tile_path};
use crate::{
    e,
    secrets::{get_secret, SECRET_KEYS},
    sources::{get_source_meta, is_valid_http_url},
    Db, Res,
};

type CachedTile = (Instant, Vec<u8>);
static REMOTE_TILE_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static REMOTE_TILE_CACHE: OnceLock<Mutex<HashMap<String, CachedTile>>> = OnceLock::new();
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

#[cfg(test)]
mod tests {
    use super::*;

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
