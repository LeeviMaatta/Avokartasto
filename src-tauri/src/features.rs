use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

use crate::{e, tiles::invalidate_tile_cache_setting, Db, Res};
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct FeatureInput {
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "featureType")]
    pub feature_type: String,
    pub geojson: String,
    #[serde(rename = "folderId")]
    pub folder_id: String,
    pub color: String,
    #[serde(rename = "imageData")]
    pub image_data: Option<String>,
}

#[derive(serde::Serialize)]
pub struct UserFeature {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub feature_type: String,
    pub geojson: String,
    pub created_at: String,
    pub folder_id: String,
    pub color: String,
    pub image_data: Option<String>,
}

pub fn validate_feature(feature_type: &str, geojson: &str) -> Res<()> {
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

#[tauri::command]
pub fn list_features(db: State<Db>) -> Res<Vec<UserFeature>> {
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
pub fn add_feature(db: State<Db>, feature: FeatureInput) -> Res<i64> {
    validate_feature(&feature.feature_type, &feature.geojson)?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO user_features (title, description, feature_type, geojson, folder_id, color, image_data) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            feature.title,
            feature.description,
            feature.feature_type,
            feature.geojson,
            feature.folder_id,
            feature.color,
            feature.image_data
        ],
    )
    .map_err(e)?;
    Ok(c.last_insert_rowid())
}

#[tauri::command]
pub fn delete_feature(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    c.execute("DELETE FROM user_features WHERE id = ?1", rusqlite::params![id])
        .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn update_feature(db: State<Db>, id: i64, feature: FeatureInput) -> Res<()> {
    validate_feature(&feature.feature_type, &feature.geojson)?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "UPDATE user_features SET title = ?1, description = ?2, feature_type = ?3, geojson = ?4, folder_id = ?5, color = ?6, image_data = ?7 WHERE id = ?8",
        rusqlite::params![
            feature.title,
            feature.description,
            feature.feature_type,
            feature.geojson,
            feature.folder_id,
            feature.color,
            feature.image_data,
            id
        ],
    )
    .map_err(e)?;
    Ok(())
}

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

#[allow(dead_code)]
pub fn app_db_ready(app: &AppHandle) -> bool {
    app.try_state::<Db>().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

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
