use std::collections::HashMap;
use tauri::State;

use crate::{e, tiles::invalidate_tile_cache_setting, Db, Res};

#[tauri::command]
pub fn get_settings(db: State<Db>) -> Res<HashMap<String, String>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c.prepare("SELECT key, value FROM settings").map_err(e)?;
    let rows = s
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(e)?;
    let mut settings = rows.collect::<Result<HashMap<_, _>, _>>().map_err(e)?;
    drop(s);
    drop(c);
    for key in crate::secrets::SECRET_KEYS {
        if let Some(value) = crate::secrets::get_secret(key)? {
            settings.insert(key.to_string(), value);
        }
    }
    Ok(settings)
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> Res<()> {
    crate::secrets::validate_setting(&key, &value)?;
    if crate::secrets::is_secret_key(&key) {
        return crate::secrets::set_secret(&key, &value);
    }
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(e)?;
    drop(c);
    if key == "tileCache" {
        invalidate_tile_cache_setting();
    }
    Ok(())
}

#[tauri::command]
pub fn set_settings(db: State<Db>, settings: HashMap<String, String>) -> Res<()> {
    for (key, value) in &settings {
        crate::secrets::validate_setting(key, value)?;
    }
    let secrets = settings
        .iter()
        .filter(|(key, _)| crate::secrets::is_secret_key(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Vec<_>>();
    let mut c = db.0.lock().map_err(e)?;
    let tx = c.transaction().map_err(e)?;
    for (key, value) in settings {
        if crate::secrets::is_secret_key(&key) {
            continue;
        }
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value],
        )
        .map_err(e)?;
    }
    tx.commit().map_err(e)?;
    drop(c);
    invalidate_tile_cache_setting();
    for (key, value) in secrets {
        crate::secrets::set_secret(&key, &value)?;
    }
    Ok(())
}
