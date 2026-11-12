use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Component, Path},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager, State};

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

#[derive(Serialize)]
pub struct LocalSource {
    pub id: i64,
    pub name: String,
    pub base_path: String,
    pub pattern: String,
    pub projection: String,
    pub role: String,
    pub opacity: f64,
    pub max_zoom: i64,
    pub attribution: String,
    pub api_type: String,
    pub tile_size: i64,
    pub layer_name: String,
    pub style: String,
    pub builtin_key: Option<String>,
    pub is_default: bool,
    pub factory_json: Option<String>,
    pub kind: String,
    pub url: String,
    pub min_zoom: i64,
    pub params: String,
    pub auth: String,
    pub note: String,
    pub view_zoom_offset: i64,
    pub view_magnification: i64,
}

#[derive(Deserialize)]
pub struct SourceInput {
    pub name: String,
    pub base_path: String,
    pub pattern: String,
    pub projection: String,
    pub role: String,
    pub opacity: f64,
    pub min_zoom: i64,
    pub max_zoom: i64,
    pub attribution: String,
    pub api_type: String,
    pub tile_size: i64,
    pub layer_name: String,
    pub style: String,
    pub url: String,
    pub params: String,
    pub auth: String,
    pub note: String,
    pub view_zoom_offset: i64,
    pub view_magnification: i64,
}

pub fn source_kind(api_type: &str) -> &'static str {
    match api_type {
        "vector_tile" => "vector",
        "wfs" | "geojson" | "gpx" | "kml" | "shapefile" => "features",
        _ => "raster",
    }
}

pub fn is_valid_http_url(raw: &str) -> bool {
    let trimmed = raw.trim().to_ascii_lowercase();
    trimmed.starts_with("http://") || trimmed.starts_with("https://")
}

pub fn validate_source(source: &SourceInput) -> Res<()> {
    if source.name.trim().is_empty() {
        return Err("Karttatason nimi on pakollinen".into());
    }
    if !matches!(source.role.as_str(), "basemap" | "overlay") {
        return Err("Virheellinen karttatason rooli".into());
    }
    if !matches!(
        source.api_type.as_str(),
        "tile"
            | "local_tile"
            | "xyz"
            | "wmts"
            | "wms"
            | "vector_tile"
            | "wfs"
            | "geojson"
            | "gpx"
            | "kml"
            | "shapefile"
            | "img"
    ) {
        return Err("Karttatason rajapintatyyppiä ei tueta".into());
    }
    if !source.opacity.is_finite() || !(0.0..=1.0).contains(&source.opacity) {
        return Err("Virheellinen karttatason läpinäkyvyys".into());
    }
    if !(0..=24).contains(&source.min_zoom)
        || !(0..=24).contains(&source.max_zoom)
        || source.min_zoom > source.max_zoom
        || !(64..=2048).contains(&source.tile_size)
    {
        return Err("Karttatason zoom- tai laattakoko on virheellinen".into());
    }
    if matches!(source.api_type.as_str(), "tile" | "local_tile") {
        if source.base_path.trim().is_empty() || source.pattern.trim().is_empty() {
            return Err("Paikallisen lähteen polku ja laattamalli ovat pakollisia".into());
        }
        let pattern_path = Path::new(&source.pattern);
        if pattern_path.is_absolute()
            || pattern_path
                .components()
                .any(|component| component == Component::ParentDir)
        {
            return Err("Laatan polun on oltava suhteellinen eikä se saa sisältää '..' -osia".into());
        }
    } else if !source.url.trim().is_empty() && !is_valid_http_url(&source.url) {
        return Err("Karttalähteen URL-osoitteen on alettava http:// tai https://".into());
    }
    Ok(())
}

#[tauri::command]
pub fn list_sources(db: State<Db>) -> Res<Vec<LocalSource>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c
        .prepare(
            "SELECT id, name, base_path, pattern, COALESCE(projection,'EPSG:3857'),
                  COALESCE(role,'basemap'), COALESCE(opacity,1.0), COALESCE(max_zoom,19),
                  COALESCE(attribution,''), COALESCE(api_type,'tile'), COALESCE(tile_size,256),
                  COALESCE(layer_name,''), COALESCE(style,''), builtin_key,
                  COALESCE(is_default,0), factory_json, COALESCE(kind,'raster'),
                  COALESCE(url,''), COALESCE(min_zoom,0), COALESCE(params,'{}'),
                  COALESCE(auth,''), COALESCE(note,''), COALESCE(view_zoom_offset,0),
                  COALESCE(view_magnification,1) FROM local_sources ORDER BY id",
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
                builtin_key: r.get(13)?,
                is_default: r.get::<_, i64>(14)? != 0,
                factory_json: r.get(15)?,
                kind: r.get(16)?,
                url: r.get(17)?,
                min_zoom: r.get(18)?,
                params: r.get(19)?,
                auth: r.get(20)?,
                note: r.get(21)?,
                view_zoom_offset: r.get(22)?,
                view_magnification: r.get(23)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(e)
}

#[tauri::command]
pub fn delete_source(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    let is_default: bool = c
        .query_row(
            "SELECT COALESCE(is_default,0) != 0 FROM local_sources WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(e)?
        .unwrap_or(false);
    if is_default {
        return Err("Oletuslähdettä ei voi poistaa".into());
    }
    c.execute("DELETE FROM local_sources WHERE id = ?1", rusqlite::params![id])
        .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

#[tauri::command]
pub fn add_source_config(db: State<Db>, source: SourceInput) -> Res<i64> {
    validate_source(&source)?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO local_sources
         (name, base_path, pattern, projection, role, opacity, min_zoom, max_zoom, attribution,
          api_type, tile_size, layer_name, style, kind, url, params, auth, note,
          view_zoom_offset, view_magnification)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
        rusqlite::params![
            source.name,
            source.base_path,
            source.pattern,
            source.projection,
            source.role,
            source.opacity,
            source.min_zoom,
            source.max_zoom,
            source.attribution,
            source.api_type,
            source.tile_size,
            source.layer_name,
            source.style,
            source_kind(&source.api_type),
            source.url,
            source.params,
            source.auth,
            source.note,
            source.view_zoom_offset,
            source.view_magnification
        ],
    )
    .map_err(e)?;
    let rowid = c.last_insert_rowid();
    drop(c);
    invalidate_source_meta_cache();
    Ok(rowid)
}

#[tauri::command]
pub fn update_source_config(db: State<Db>, id: i64, source: SourceInput) -> Res<()> {
    validate_source(&source)?;
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "UPDATE local_sources SET name=?1,base_path=?2,pattern=?3,projection=?4,role=?5,
         opacity=?6,min_zoom=?7,max_zoom=?8,attribution=?9,api_type=?10,tile_size=?11,
         layer_name=?12,style=?13,kind=?14,url=?15,params=?16,auth=?17,note=?18,
         view_zoom_offset=?19,view_magnification=?20 WHERE id=?21",
        rusqlite::params![
            source.name,
            source.base_path,
            source.pattern,
            source.projection,
            source.role,
            source.opacity,
            source.min_zoom,
            source.max_zoom,
            source.attribution,
            source.api_type,
            source.tile_size,
            source.layer_name,
            source.style,
            source_kind(&source.api_type),
            source.url,
            source.params,
            source.auth,
            source.note,
            source.view_zoom_offset,
            source.view_magnification,
            id
        ],
    )
    .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

#[tauri::command]
pub fn reset_source_to_default(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    let factory: String = c
        .query_row(
            "SELECT factory_json FROM local_sources WHERE id=?1 AND is_default=1",
            [id],
            |row| row.get(0),
        )
        .map_err(e)?;
    let value: serde_json::Value = serde_json::from_str(&factory).map_err(e)?;
    let text = |key: &str| value.get(key).and_then(serde_json::Value::as_str).unwrap_or("");
    let params_str = value
        .get("params")
        .map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))
        .unwrap_or_else(|| "{}".into());
    c.execute(
        "UPDATE local_sources SET name=?1,role=?2,api_type=?3,url=?4,attribution=?5,
         max_zoom=?6,opacity=?7,params=?8,auth=?9,note=?10,kind=?11,
         base_path='',pattern='{z}/{x}/{y}.png',min_zoom=0,tile_size=256,
         layer_name='',style='',view_zoom_offset=0,view_magnification=1 WHERE id=?12",
        rusqlite::params![
            text("name"),
            text("role"),
            text("api_type"),
            text("url"),
            text("attribution"),
            value.get("max_zoom").and_then(serde_json::Value::as_i64).unwrap_or(19),
            value.get("opacity").and_then(serde_json::Value::as_f64).unwrap_or(1.0),
            params_str,
            text("auth"),
            text("note"),
            source_kind(text("api_type")),
            id
        ],
    )
    .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_source(api_type: &str) -> SourceInput {
        SourceInput {
            name: "Test layer".into(),
            base_path: "C:\\tiles".into(),
            pattern: "{z}/{x}/{y}.png".into(),
            projection: "EPSG:3857".into(),
            role: "overlay".into(),
            opacity: 1.0,
            min_zoom: 0,
            max_zoom: 19,
            attribution: "".into(),
            api_type: api_type.into(),
            tile_size: 256,
            layer_name: "".into(),
            style: "".into(),
            url: "".into(),
            params: "{}".into(),
            auth: "".into(),
            note: "".into(),
            view_zoom_offset: 0,
            view_magnification: 1,
        }
    }

    #[test]
    fn rejects_unsupported_source_types_and_parent_paths() {
        assert!(validate_source(&sample_source("vector")).is_err());

        let mut parent = sample_source("tile");
        parent.pattern = "../{z}/{x}/{y}.png".into();
        assert!(validate_source(&parent).is_err());
    }

    #[test]
    fn validates_remote_urls_and_allows_img_without_local_pattern() {
        let mut img_layer = sample_source("img");
        img_layer.base_path = "".into();
        img_layer.pattern = "".into();
        img_layer.url = "https://example.com/map.png".into();
        assert!(validate_source(&img_layer).is_ok());

        let mut bad_url = sample_source("xyz");
        bad_url.url = "javascript:alert(1)".into();
        assert!(validate_source(&bad_url).is_err());

        let mut template_layer = sample_source("xyz");
        template_layer.url = "".into();
        assert!(validate_source(&template_layer).is_ok());
    }
}
