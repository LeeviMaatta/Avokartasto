import { fromEtrs } from "../../../shared/projections";
import { formatWgsCoords } from "../../../shared/geo/coordinateFormatting";

export type CoordinateSearchHit = {
  lat: number;
  lon: number;
  label: string;
  format: "WGS84" | "ETRS-TM35FIN";
};

type Hemisphere = "N" | "S" | "E" | "W";

type ParsedAngle = {
  value: number;
  hemi: Hemisphere | null;
};

const ETRS_N_MIN = 6_500_000;
const ETRS_N_MAX = 7_900_000;
const ETRS_E_MIN = 50_000;
const ETRS_E_MAX = 800_000;

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function isEtrsNorthing(val: number): boolean {
  return Number.isFinite(val) && val >= ETRS_N_MIN && val <= ETRS_N_MAX;
}

function isEtrsEasting(val: number): boolean {
  return Number.isFinite(val) && val >= ETRS_E_MIN && val <= ETRS_E_MAX;
}

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function buildHit(lat: number, lon: number, format: "WGS84" | "ETRS-TM35FIN"): CoordinateSearchHit | null {
  if (!isValidLatLon(lat, lon)) return null;
  return {
    lat,
    lon,
    label: formatWgsCoords(lat, lon, "dd"),
    format,
  };
}

function parseEtrs(text: string): CoordinateSearchHit | null {
  // Labeled: "N: 6671234, E: 385432", "E 385432 N 6671234", "N=6671234.5; E=385432.2"
  const labeledRe =
    /^([NE])\s*[:=]?\s*(\d{5,7}(?:[.,]\d+)?)\s*(?:[,;/]|\s)+\s*([NE])\s*[:=]?\s*(\d{5,7}(?:[.,]\d+)?)$/i;
  const labeled = text.match(labeledRe);
  if (labeled) {
    const aKey = labeled[1].toUpperCase();
    const aVal = parseNumber(labeled[2]);
    const bKey = labeled[3].toUpperCase();
    const bVal = parseNumber(labeled[4]);
    if (aKey === bKey) return null;
    const northing = aKey === "N" ? aVal : bVal;
    const easting = aKey === "E" ? aVal : bVal;
    if (!isEtrsNorthing(northing) || !isEtrsEasting(easting)) return null;
    const [lon, lat] = fromEtrs([easting, northing]);
    return buildHit(lat, lon, "ETRS-TM35FIN");
  }

  // Unlabeled pair of large ETRS-TM35FIN numbers: "6671234, 385432" or "6671234 385432"
  const plainRe = /^(\d{5,7}(?:\.\d+)?)\s*(?:[,;/]\s*|\s+)(\d{5,7}(?:\.\d+)?)$/;
  const plain = text.match(plainRe);
  if (plain) {
    const a = Number(plain[1]);
    const b = Number(plain[2]);
    if (isEtrsNorthing(a) && isEtrsEasting(b)) {
      const [lon, lat] = fromEtrs([b, a]);
      return buildHit(lat, lon, "ETRS-TM35FIN");
    }
    if (isEtrsEasting(a) && isEtrsNorthing(b)) {
      const [lon, lat] = fromEtrs([a, b]);
      return buildHit(lat, lon, "ETRS-TM35FIN");
    }
  }

  return null;
}

function parseSingleAngle(token: string): ParsedAngle | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Extract optional leading or trailing hemisphere letter (N/S/E/W)
  let hemi: Hemisphere | null = null;
  let body = trimmed;

  const leadMatch = body.match(/^([NSEW])\s*(.+)$/i);
  const trailMatch = body.match(/^(.+?)\s*([NSEW])$/i);

  if (leadMatch && trailMatch) return null;
  if (leadMatch) {
    hemi = leadMatch[1].toUpperCase() as Hemisphere;
    body = leadMatch[2].trim();
  } else if (trailMatch) {
    hemi = trailMatch[2].toUpperCase() as Hemisphere;
    body = trailMatch[1].trim();
  }

  // Disallow negative/positive sign combined with explicit hemisphere
  if (hemi && /^[+-]/.test(body)) return null;

  let sign = 1;
  if (body.startsWith("-")) {
    sign = -1;
    body = body.slice(1).trim();
  } else if (body.startsWith("+")) {
    body = body.slice(1).trim();
  }

  // DMS or DDM: e.g. 66° 42' 32.5", 66° 42′ 32″, 66° 42.534'
  const dmsRe =
    /^(\d{1,3})\s*[°º]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|''|′′)?)?)?$/;
  const dms = body.match(dmsRe);
  if (dms) {
    const deg = Number(dms[1]);
    const min = dms[2] !== undefined ? parseNumber(dms[2]) : 0;
    const sec = dms[3] !== undefined ? parseNumber(dms[3]) : 0;
    if (min >= 60 || sec >= 60) return null;
    if (dms[3] !== undefined && !Number.isInteger(min)) return null;
    const absVal = deg + min / 60 + sec / 3600;
    const finalSign = hemi === "S" || hemi === "W" ? -1 : sign;
    return { value: finalSign * absVal, hemi };
  }

  // Decimal degrees: e.g. 66.7089, 66.7089°, 66,7089°
  const ddRe = /^(\d{1,3}(?:[.,]\d+)?)\s*[°º]?$/;
  const dd = body.match(ddRe);
  if (dd) {
    const absVal = parseNumber(dd[1]);
    if (!Number.isFinite(absVal)) return null;
    const finalSign = hemi === "S" || hemi === "W" ? -1 : sign;
    return { value: finalSign * absVal, hemi };
  }

  return null;
}

function splitCoordinatePair(text: string): [string, string] | null {
  // Prefer explicit delimiter (; or /)
  const semiParts = text.split(/\s*[;/]\s*/);
  if (semiParts.length === 2 && semiParts[0] && semiParts[1]) {
    return [semiParts[0], semiParts[1]];
  }

  // Leading hemispheres: "N 66.7089, E 19.5342", "N 66,7089 E 19,5342"
  const beforeHemiSplit = text.match(/^([NSEW]\s*[^NSEW]+?)[\s,]+([NSEW]\s*[^NSEW]+)$/i);
  if (beforeHemiSplit) {
    return [beforeHemiSplit[1], beforeHemiSplit[2]];
  }

  // Trailing hemispheres: "66.7089° N, 19.5342° E", "66,7089° N, 19,5342° E", "66°42'32\"N 19°32'03\"E"
  const afterHemiSplit = text.match(/^([^NSEW]+?[NSEW])[\s,]+([^NSEW]+?[NSEW])$/i);
  if (afterHemiSplit) {
    return [afterHemiSplit[1], afterHemiSplit[2]];
  }

  // Comma separator (avoid misinterpreting a single decimal number like "66,19" as two integers)
  const commaParts = text.split(/\s*,\s*/);
  if (commaParts.length === 2 && commaParts[0] && commaParts[1]) {
    const looksLikeSingleDecimal = /^\d+,\d+$/.test(text);
    if (!looksLikeSingleDecimal) {
      return [commaParts[0], commaParts[1]];
    }
  }

  // Plain whitespace-separated pair of decimal numbers: "66.7089 19.5342"
  const spaceParts = text.split(/\s+/);
  if (spaceParts.length === 2) {
    return [spaceParts[0], spaceParts[1]];
  }

  return null;
}

function resolvePair(a: ParsedAngle, b: ParsedAngle): [number, number] | null {
  const aIsLat = a.hemi === "N" || a.hemi === "S";
  const aIsLon = a.hemi === "E" || a.hemi === "W";
  const bIsLat = b.hemi === "N" || b.hemi === "S";
  const bIsLon = b.hemi === "E" || b.hemi === "W";

  if (a.hemi && b.hemi) {
    if (aIsLat && bIsLon) return [a.value, b.value];
    if (aIsLon && bIsLat) return [b.value, a.value];
    return null;
  }

  // Only one hemisphere specified is ambiguous -> reject
  if (a.hemi || b.hemi) return null;

  return [a.value, b.value];
}

/**
 * Parses a coordinate string in WGS84 (DD, DDM, DMS) or ETRS-TM35FIN into a search hit.
 * Returns null if the input does not represent a valid coordinate pair.
 */
export function parseCoordinateQuery(rawInput: string): CoordinateSearchHit | null {
  const text = rawInput.trim();
  if (text.length < 3) return null;

  const etrsHit = parseEtrs(text);
  if (etrsHit) return etrsHit;

  const pair = splitCoordinatePair(text);
  if (!pair) return null;

  const first = parseSingleAngle(pair[0]);
  const second = parseSingleAngle(pair[1]);
  if (!first || !second) return null;

  // Reject plain integer pairs without degree symbols/hemispheres like "10, 20" unless
  // at least one has decimals, a degree sign, or hemisphere? Actually "60, 25" could be
  // valid coordinates, while "Mannerheimintie 10, 20" already fails parseSingleAngle.
  const resolved = resolvePair(first, second);
  if (!resolved) return null;

  return buildHit(resolved[0], resolved[1], "WGS84");
}
