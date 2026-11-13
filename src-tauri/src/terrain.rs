use std::{sync::OnceLock, time::Duration};

use crate::{e, Res};

static TERRAIN_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();

const OVERPASS_ENDPOINTS: [&str; 2] = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

fn terrain_client() -> &'static reqwest::blocking::Client {
    TERRAIN_CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(12))
            .user_agent("Avokartasto/1.0 (+https://fi.avokartasto.desktop)")
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new())
    })
}

fn validate_https_url(raw: &str) -> Res<&str> {
    let trimmed = raw.trim();
    if !trimmed.starts_with("https://") {
        return Err("Vain HTTPS-osoitteet on sallittu".into());
    }
    Ok(trimmed)
}

#[tauri::command]
pub async fn terrain_fetch_binary(url: String) -> Res<Vec<u8>> {
    let valid_url = validate_https_url(&url)?.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let response = terrain_client()
            .get(&valid_url)
            .header("Accept-Encoding", "identity")
            .send()
            .map_err(e)?;
        if !response.status().is_success() {
            return Err(format!("Maasto-osoite palautti HTTP {}", response.status()));
        }
        response.bytes().map(|b| b.to_vec()).map_err(e)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub async fn terrain_overpass_query(query: String) -> Res<String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() {
        return Err("Overpass-kysely puuttuu".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let client = terrain_client();
        let mut last_err = String::from("Overpass-kysely epäonnistui");
        for endpoint in OVERPASS_ENDPOINTS {
            let res = client
                .post(endpoint)
                .header("Accept", "application/json")
                .header("Accept-Encoding", "identity")
                .form(&[("data", trimmed.as_str())])
                .send();
            match res {
                Ok(resp) if resp.status().is_success() => {
                    return resp.text().map_err(e);
                }
                Ok(resp) => {
                    last_err = format!("Overpass palautti HTTP {}", resp.status());
                }
                Err(err) => {
                    last_err = err.to_string();
                }
            }
        }
        Err(last_err)
    })
    .await
    .map_err(e)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_terrain_urls() {
        assert!(validate_https_url("http://example.com/a.pbf").is_err());
        assert!(validate_https_url("https://tiles.openfreemap.org/planet").is_ok());
    }
}
