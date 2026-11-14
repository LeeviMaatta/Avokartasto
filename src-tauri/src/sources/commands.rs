use rusqlite::OptionalExtension;
use tauri::State;

use super::cache::invalidate_source_meta_cache;
use super::validation::{source_kind, validate_source, LocalSource, SourceInput};
use crate::{e, Db, Res};

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
         layer_name=?12,style=?13,view_zoom_offset=0,view_magnification=1 WHERE id=?14",
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
            text("layer_name"),
            text("style"),
            id
        ],
    )
    .map_err(e)?;
    drop(c);
    invalidate_source_meta_cache();
    Ok(())
}
