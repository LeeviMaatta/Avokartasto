use std::path::Path;
use tauri::Manager;

use crate::Res;

fn sanitize_export_filename(filename: &str) -> String {
    let base = Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control()
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "mittaus.geojson".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn save_export_to_dir(dir: &Path, filename: &str, content: &str) -> Res<String> {
    std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    let safe_name = sanitize_export_filename(filename);

    let mut target = dir.join(&safe_name);
    if target.exists() {
        let stem = target
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("mittaus")
            .to_string();
        let ext = target
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("geojson")
            .to_string();
        for i in 1..1000 {
            let candidate = dir.join(format!("{stem} ({i}).{ext}"));
            if !candidate.exists() {
                target = candidate;
                break;
            }
        }
    }

    std::fs::write(&target, content.as_bytes()).map_err(|err| err.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn save_export_file(app: tauri::AppHandle, filename: String, content: String) -> Res<String> {
    let downloads = app.path().download_dir().map_err(|err| err.to_string())?;
    save_export_to_dir(&downloads, &filename, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn sanitizes_traversal_and_invalid_chars() {
        assert_eq!(sanitize_export_filename("../../evil:name?.geojson"), "evil_name_.geojson");
        assert_eq!(sanitize_export_filename("..."), "mittaus.geojson");
        assert_eq!(sanitize_export_filename(""), "mittaus.geojson");
    }

    #[test]
    fn writes_unique_files_without_overwriting() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let temp_dir = std::env::temp_dir().join(format!("avokartasto-export-test-{nonce}"));
        let first = save_export_to_dir(&temp_dir, "reitti.geojson", "{}").unwrap();
        let second = save_export_to_dir(&temp_dir, "reitti.geojson", "{\"v\":2}").unwrap();
        assert_ne!(first, second);
        assert!(second.ends_with("reitti (1).geojson"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
