use crate::{e, Res};

pub fn mime_of(b: &[u8]) -> &'static str {
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

pub fn validate_tile_coordinates(z: u32, x: u32, y: u32) -> Res<()> {
    if z > 31 {
        return Err("zoom-arvo on liian suuri".into());
    }
    let limit = 1u32 << z;
    if x >= limit || y >= limit {
        return Err("laatan koordinaatit eivät kuulu zoom-tasolle".into());
    }
    Ok(())
}

pub fn parse_tile_path(path: &str) -> Res<(i64, u32, u32, u32)> {
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    if parts.len() != 4 {
        return Err("virheellinen polku".into());
    }
    let id: i64 = parts[0].parse().map_err(e)?;
    let z: u32 = parts[1].parse().map_err(e)?;
    let x: u32 = parts[2].parse().map_err(e)?;
    let y: u32 = parts[3]
        .split('.')
        .next()
        .unwrap_or("")
        .parse()
        .map_err(e)?;
    validate_tile_coordinates(z, x, y)?;
    Ok((id, z, x, y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_tile_zoom_overflow_and_out_of_range_coordinates() {
        assert!(parse_tile_path("/1/32/0/0").is_err());
        assert!(parse_tile_path("/1/2/4/0").is_err());
        assert!(parse_tile_path("/1/2/0/4").is_err());
        assert_eq!(parse_tile_path("/1/2/3/3.png").unwrap(), (1, 2, 3, 3));
    }
}
