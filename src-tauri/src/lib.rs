mod db;
mod export;
mod features;
mod nominatim;
mod secrets;
mod sources;
mod terrain;
mod tiles;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{http::Response, Manager};

pub struct Db(pub Mutex<Connection>);

pub(crate) type Res<T> = Result<T, String>;
pub(crate) fn e<E: ToString>(x: E) -> String {
    x.to_string()
}

fn allowed_cors_origin(origin: Option<&str>) -> &'static str {
    match origin {
        Some("https://tauri.localhost") => "https://tauri.localhost",
        Some("tauri://localhost") => "tauri://localhost",
        Some("http://localhost:1420") => "http://localhost:1420",
        _ => "http://tauri.localhost",
    }
}

fn tile_response(status: u16, origin: Option<&str>, mime: Option<&str>, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", allowed_cors_origin(origin));
    if let Some(content_type) = mime {
        builder = builder.header("Content-Type", content_type);
    }
    builder.body(body).unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("app-tile", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            let origin = request
                .headers()
                .get("origin")
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            tauri::async_runtime::spawn_blocking(move || {
                let response = match tiles::read_tile(&app, &path) {
                    Ok((bytes, mime)) => tile_response(200, origin.as_deref(), Some(mime), bytes),
                    Err(_) => tile_response(404, origin.as_deref(), None, Vec::new()),
                };
                responder.respond(response);
            });
        })
        .register_asynchronous_uri_scheme_protocol("remote-tile", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            let origin = request
                .headers()
                .get("origin")
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            tauri::async_runtime::spawn_blocking(move || {
                let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
                if parts.len() != 4 {
                    responder.respond(tile_response(400, origin.as_deref(), None, Vec::new()));
                    return;
                }
                let result = tiles::read_remote_tile(&app, &path);
                let response = match result {
                    Ok((bytes, mime)) => tile_response(200, origin.as_deref(), Some(mime), bytes),
                    Err(_) => tile_response(502, origin.as_deref(), None, Vec::new()),
                };
                responder.respond(response);
            });
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            db::migrate_legacy_data_dir(&dir);
            let conn = Connection::open(dir.join("app_data.db"))?;
            db::initialize_db(&conn).map_err(std::io::Error::other)?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            features::get_settings,
            features::set_setting,
            features::set_settings,
            sources::list_sources,
            sources::delete_source,
            sources::add_source_config,
            sources::update_source_config,
            sources::reset_source_to_default,
            features::list_features,
            features::add_feature,
            features::update_feature,
            features::delete_feature,
            export::save_export_file,
            nominatim::nominatim_search,
            nominatim::nominatim_reverse,
            terrain::terrain_fetch_binary,
            terrain::terrain_overpass_query
        ])
        .run(tauri::generate_context!())
        .expect("Tauri-sovelluksen käynnistys epäonnistui");
}
