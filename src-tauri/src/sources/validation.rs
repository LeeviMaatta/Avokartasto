use serde::{Deserialize, Serialize};
use std::path::{Component, Path};

use crate::Res;

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
