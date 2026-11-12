use std::{sync::OnceLock, time::Duration};

use crate::{e, Res};

static NOMINATIM_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();

fn nominatim_client() -> &'static reqwest::blocking::Client {
    NOMINATIM_CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(12))
            .user_agent("Karttasovellus/1.0 (+https://fi.karttasovellus.desktop)")
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new())
    })
}

fn validate_search_query(query: &str) -> Res<String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Hakusana puuttuu".into());
    }
    Ok(trimmed.to_string())
}

fn validate_reverse_coords(lat: f64, lon: f64) -> Res<()> {
    if !lat.is_finite()
        || !lon.is_finite()
        || !(-90.0..=90.0).contains(&lat)
        || !(-180.0..=180.0).contains(&lon)
    {
        return Err("Virheelliset koordinaatit".into());
    }
    Ok(())
}

fn send_nominatim_get(url: &str, params: &[(&str, String)]) -> Res<String> {
    let response = nominatim_client()
        .get(url)
        .header("Accept", "application/json")
        .header("Accept-Language", "fi,en;q=0.8")
        .query(params)
        .send()
        .map_err(e)?;
    if !response.status().is_success() {
        return Err(format!("Nominatim palautti HTTP {}", response.status()));
    }
    response.text().map_err(e)
}

#[tauri::command]
pub async fn nominatim_search(query: String, limit: Option<u32>) -> Res<String> {
    let trimmed = validate_search_query(&query)?;
    let clamped_limit = limit.unwrap_or(6).clamp(1, 20);
    tauri::async_runtime::spawn_blocking(move || {
        let params = [
            ("format", "jsonv2".to_string()),
            ("q", trimmed),
            ("limit", clamped_limit.to_string()),
            ("addressdetails", "1".to_string()),
        ];
        send_nominatim_get("https://nominatim.openstreetmap.org/search", &params)
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub async fn nominatim_reverse(lat: f64, lon: f64, zoom: Option<u32>) -> Res<String> {
    validate_reverse_coords(lat, lon)?;
    let zoom_level = zoom.unwrap_or(14).clamp(0, 18);
    tauri::async_runtime::spawn_blocking(move || {
        let params = [
            ("format", "jsonv2".to_string()),
            ("lat", format!("{lat:.6}")),
            ("lon", format!("{lon:.6}")),
            ("zoom", zoom_level.to_string()),
            ("addressdetails", "1".to_string()),
        ];
        send_nominatim_get("https://nominatim.openstreetmap.org/reverse", &params)
    })
    .await
    .map_err(e)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_nominatim_inputs() {
        assert!(validate_search_query("   ").is_err());
        assert_eq!(validate_search_query(" Helsinki ").unwrap(), "Helsinki");

        assert!(validate_reverse_coords(120.0, 24.0).is_err());
        assert!(validate_reverse_coords(f64::NAN, 24.0).is_err());
        assert!(validate_reverse_coords(60.1699, 24.9384).is_ok());
    }
}
