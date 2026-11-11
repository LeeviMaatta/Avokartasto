use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{http::Response, AppHandle, Manager, State};

pub struct Db(pub Mutex<Connection>);

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS local_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_path TEXT NOT NULL,
    pattern TEXT NOT NULL,
    projection TEXT DEFAULT 'EPSG:3857'
);
CREATE TABLE IF NOT EXISTS user_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    feature_type TEXT NOT NULL,
    geojson TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
";

type Res<T> = Result<T, String>;
fn e<E: ToString>(x: E) -> String {
    x.to_string()
}

#[derive(Serialize)]
struct LocalSource {
    id: i64,
    name: String,
    base_path: String,
    pattern: String,
    projection: String,
}

#[derive(Serialize)]
struct UserFeature {
    id: i64,
    title: String,
    description: Option<String>,
    feature_type: String,
    geojson: String,
    created_at: String,
}

// ---------- Asetukset ----------
#[tauri::command]
fn get_settings(db: State<Db>) -> Res<HashMap<String, String>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c.prepare("SELECT key, value FROM settings").map_err(e)?;
    let rows = s
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(e)?;
    rows.collect::<Result<HashMap<_, _>, _>>().map_err(e)
}

#[tauri::command]
fn set_setting(db: State<Db>, key: String, value: String) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(e)?;
    Ok(())
}

// ---------- Paikalliset lähteet ----------
#[tauri::command]
fn list_sources(db: State<Db>) -> Res<Vec<LocalSource>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c
        .prepare("SELECT id, name, base_path, pattern, COALESCE(projection,'EPSG:3857') FROM local_sources ORDER BY id")
        .map_err(e)?;
    let rows = s
        .query_map([], |r| {
            Ok(LocalSource {
                id: r.get(0)?,
                name: r.get(1)?,
                base_path: r.get(2)?,
                pattern: r.get(3)?,
                projection: r.get(4)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(e)
}

#[tauri::command]
fn add_source(db: State<Db>, name: String, base_path: String, pattern: String) -> Res<i64> {
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO local_sources (name, base_path, pattern) VALUES (?1, ?2, ?3)",
        params![name, base_path, pattern],
    )
    .map_err(e)?;
    Ok(c.last_insert_rowid())
}

#[tauri::command]
fn delete_source(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    c.execute("DELETE FROM local_sources WHERE id = ?1", params![id]).map_err(e)?;
    Ok(())
}

// ---------- Merkinnät ja mittaukset ----------
#[tauri::command]
fn list_features(db: State<Db>) -> Res<Vec<UserFeature>> {
    let c = db.0.lock().map_err(e)?;
    let mut s = c
        .prepare("SELECT id, title, description, feature_type, geojson, COALESCE(created_at,'') FROM user_features ORDER BY id DESC")
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
            })
        })
        .map_err(e)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(e)
}

#[tauri::command]
fn add_feature(
    db: State<Db>,
    title: String,
    description: Option<String>,
    feature_type: String,
    geojson: String,
) -> Res<i64> {
    let c = db.0.lock().map_err(e)?;
    c.execute(
        "INSERT INTO user_features (title, description, feature_type, geojson) VALUES (?1, ?2, ?3, ?4)",
        params![title, description, feature_type, geojson],
    )
    .map_err(e)?;
    Ok(c.last_insert_rowid())
}

#[tauri::command]
fn delete_feature(db: State<Db>, id: i64) -> Res<()> {
    let c = db.0.lock().map_err(e)?;
    c.execute("DELETE FROM user_features WHERE id = ?1", params![id]).map_err(e)?;
    Ok(())
}

// ---------- app-tile:// -protokolla ----------
fn mime_of(b: &[u8]) -> &'static str {
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

fn read_tile(app: &AppHandle, path: &str) -> Result<(Vec<u8>, &'static str), String> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 4 {
        return Err("virheellinen polku".into());
    }
    let id: i64 = parts[0].parse().map_err(e)?;
    let z: u32 = parts[1].parse().map_err(e)?;
    let x: u32 = parts[2].parse().map_err(e)?;
    let y: u32 = parts[3].split('.').next().unwrap_or("").parse().map_err(e)?;
    let flipped = (1u32 << z) - 1 - y;

    let db = app.try_state::<Db>().ok_or("tietokanta ei valmis")?;
    let (base, pattern): (String, String) = {
        let c = db.0.lock().map_err(e)?;
        c.query_row(
            "SELECT base_path, pattern FROM local_sources WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(e)?
    };

    let bytes = if base.to_lowercase().ends_with(".mbtiles") {
        let conn = Connection::open_with_flags(&base, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
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
        
        let paths: Vec<&str> = base.split(|c| c == ';' || c == '\n' || c == ',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        let mut found = None;
        for p in paths {
            let full_path = std::path::Path::new(p).join(&rel);
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

fn read_lantmateriet_tile(app: &AppHandle, path: &str) -> Result<(Vec<u8>, &'static str), String> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 3 {
        return Err("virheellinen Lantmäteriet-laatan polku".into());
    }
    let z = parts[0];
    let x = parts[1];
    let y = parts[2].split('.').next().unwrap_or("");
    let db = app.try_state::<Db>().ok_or("tietokanta ei valmis")?;
    let c = db.0.lock().map_err(e)?;
    let (username, password): (String, String) = c
        .query_row(
            "SELECT
                COALESCE((SELECT value FROM settings WHERE key='lantmaterietUsername'), ''),
                COALESCE((SELECT value FROM settings WHERE key='lantmaterietPassword'), '')",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(e)?;
    drop(c);
    if username.is_empty() || password.is_empty() {
        return Err("Lantmäteriet-tunnukset puuttuvat".into());
    }

    let url = format!(
        "https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts/1.0.0/topowebb/default/3857/{z}/{y}/{x}.png"
    );
    let response = reqwest::blocking::Client::new()
        .get(url)
        .basic_auth(username, Some(password))
        .send()
        .map_err(e)?;
    if !response.status().is_success() {
        return Err(format!("Lantmäteriet palautti HTTP {}", response.status()));
    }
    let bytes = response.bytes().map_err(e)?.to_vec();
    Ok((bytes, "image/png"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("app-tile", |ctx, request| {
            match read_tile(ctx.app_handle(), request.uri().path()) {
                Ok((bytes, mime)) => Response::builder()
                    .status(200)
                    .header("Content-Type", mime)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap(),
                Err(_) => Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap(),
            }
        })
        .register_uri_scheme_protocol("lantmateriet-tile", |ctx, request| {
            match read_lantmateriet_tile(ctx.app_handle(), request.uri().path()) {
                    Ok((bytes, mime)) => Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap(),
                    Err(_) => Response::builder()
                        .status(502)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new())
                        .unwrap(),
            }
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("app_data.db"))?;
            conn.execute_batch(SCHEMA)?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_setting,
            list_sources,
            add_source,
            delete_source,
            list_features,
            add_feature,
            delete_feature
        ])
        .run(tauri::generate_context!())
        .expect("Tauri-sovelluksen käynnistys epäonnistui");
}