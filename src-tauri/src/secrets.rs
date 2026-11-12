use keyring::{Entry, Error as KeyringError};
use rusqlite::{Connection, OptionalExtension};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use crate::{e, Res};

pub const KEYRING_SERVICE: &str = "fi.karttasovellus.desktop";
const LEGACY_KEYRING_SERVICE: &str = "fi.example.karttasovellus";

pub const SECRET_KEYS: [&str; 5] = [
    "mmlKey",
    "lantmaterietUsername",
    "lantmaterietPassword",
    "owmKey",
    "copernicusInstanceId",
];

static SECRET_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

pub fn is_secret_key(key: &str) -> bool {
    SECRET_KEYS.contains(&key)
}

fn keyring_entry(key: &str) -> Res<Entry> {
    Entry::new(KEYRING_SERVICE, key).map_err(e)
}

fn legacy_keyring_entry(key: &str) -> Res<Entry> {
    Entry::new(LEGACY_KEYRING_SERVICE, key).map_err(e)
}

pub fn set_secret(key: &str, value: &str) -> Res<()> {
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
                if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                },
            );
        }
    }
    res
}

pub fn get_secret(key: &str) -> Res<Option<String>> {
    let cache = SECRET_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(map) = cache.lock() {
        if let Some(cached) = map.get(key) {
            return Ok(cached.clone());
        }
    }
    let fetched = match keyring_entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => match legacy_keyring_entry(key)?.get_password() {
            Ok(legacy_val) => {
                // Migrate credential from legacy fi.example.karttasovellus entry on first read
                if !legacy_val.is_empty() {
                    let _ = keyring_entry(key)?.set_password(&legacy_val);
                }
                Ok(Some(legacy_val))
            }
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        },
        Err(error) => Err(error.to_string()),
    }?;
    if let Ok(mut map) = cache.lock() {
        map.insert(key.to_string(), fetched.clone());
    }
    Ok(fetched)
}

pub fn migrate_secret_settings(conn: &Connection) -> Res<()> {
    for key in SECRET_KEYS {
        let value = conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(e)?;
        if let Some(value) = value {
            if !value.is_empty() {
                set_secret(key, &value)?;
            }
            conn.execute("DELETE FROM settings WHERE key = ?1", [key])
                .map_err(e)?;
        }
    }
    Ok(())
}

pub fn validate_setting(key: &str, value: &str) -> Res<()> {
    if key.is_empty() || key.len() > 128 {
        return Err("Virheellinen asetuksen avain".into());
    }
    if value.len() > 64 * 1024 {
        return Err("Asetuksen arvo on liian suuri".into());
    }
    Ok(())
}
