import { fetchWithDebug } from "../../debug/services/debugFetch";
import {
  FORECAST_DAYS,
  type DayParts,
  type DetailedWeather,
  type ForecastDay,
  type ForecastHour,
  type WeatherForecast,
} from "../model/weatherTypes";
import { parseCurrentWeather, parseFiveDay, parseOneCall } from "./weatherParsers";
import { formatLocalTime } from "./weatherFormatting";

export {
  FORECAST_DAYS,
  formatLocalTime,
  type DayParts,
  type DetailedWeather,
  type ForecastDay,
  type ForecastHour,
  type WeatherForecast,
};

const MAX_CACHE_ENTRIES = 256;
const cache = new Map<string, { value: DetailedWeather; expires: number }>();
const forecastCache = new Map<string, { value: WeatherForecast; expires: number }>();

// Pyyntörajoitin (OpenWeatherMap free tier: max 60 rpm)
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_DATA_REQUESTS_PER_MIN = 45;
const requestTimestamps: number[] = [];
let cooldownUntil = 0;
// One Call 3.0 vaatii erillisen tilauksen; 401:n jälkeen ei yritetä uudelleen samalla avaimella.
let oneCallUnavailableForKey: string | null = null;

function isRateLimited(): boolean {
  const now = Date.now();
  if (now < cooldownUntil) return true;
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length >= MAX_DATA_REQUESTS_PER_MIN;
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

function handle429(): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + 30_000);
}

const setBoundedCache = <T>(map: Map<string, { value: T; expires: number }>, key: string, value: T, ttlMs: number) => {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, { value, expires: Date.now() + ttlMs });
};

export async function fetchWeather(lat: number, lon: number, key: string, signal?: AbortSignal): Promise<DetailedWeather | null> {
  // 0.1 asteen pyöristys (~11 km) yhdistää saman alueen haut yhteen välimuistikohteeseen
  const ck = `${lat.toFixed(1)},${lon.toFixed(1)}:${key.slice(-6)}`;
  const hit = cache.get(ck);
  if (hit && hit.expires > Date.now()) return hit.value;

  if (isRateLimited()) {
    return hit ? hit.value : null;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(key)}&units=metric&lang=fi`;
  recordRequest();
  const r = await fetchWithDebug(url, { signal }, "weather");
  if (r.status === 429) {
    handle429();
    return hit ? hit.value : null;
  }
  if (!r.ok) return null;
  const w = parseCurrentWeather(await r.json());
  setBoundedCache(cache, ck, w, 900_000); // 15 min TTL
  return w;
}

export async function fetchForecast(lat: number, lon: number, key: string, signal?: AbortSignal): Promise<WeatherForecast> {
  const ck = `${lat.toFixed(1)},${lon.toFixed(1)}:${key.slice(-6)}`;
  const hit = forecastCache.get(ck);
  if (hit && hit.expires > Date.now()) return hit.value;

  if (isRateLimited()) {
    if (hit) return hit.value;
    const remainingSec = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
    throw new Error(
      Date.now() < cooldownUntil
        ? `Sääpalvelun kiintiö täynnä (HTTP 429). Yritä uudelleen ${remainingSec} s kuluttua.`
        : "OpenWeatherMap-pyyntöraja (60 rpm) saavutettu. Odota hetki ennen seuraavaa ennustehakua.",
    );
  }

  const query = `lat=${lat}&lon=${lon}&appid=${encodeURIComponent(key)}&units=metric&lang=fi`;
  let value: WeatherForecast | null = null;
  if (oneCallUnavailableForKey !== key) {
    recordRequest();
    const r = await fetchWithDebug(`https://api.openweathermap.org/data/3.0/onecall?${query}&exclude=minutely,alerts`, { signal }, "weather-onecall");
    if (r.ok) {
      value = parseOneCall(await r.json());
    } else if (r.status === 429) {
      handle429();
      if (hit) return hit.value;
      throw new Error("Sääpalvelun kiintiö täynnä (HTTP 429). Odotetaan 30 sekuntia...");
    } else if (r.status === 401) {
      oneCallUnavailableForKey = key;
    } else {
      throw new Error(`Sääennustetta ei voitu hakea (HTTP ${r.status})`);
    }
  }
  if (!value) {
    recordRequest();
    const r = await fetchWithDebug(`https://api.openweathermap.org/data/2.5/forecast?${query}`, { signal }, "weather-forecast");
    if (r.status === 429) {
      handle429();
      if (hit) return hit.value;
      throw new Error("Sääpalvelun kiintiö täynnä (HTTP 429). Odotetaan 30 sekuntia...");
    }
    if (!r.ok) {
      throw new Error(r.status === 401 ? "OpenWeatherMap API-avain ei kelpaa" : `Sääennustetta ei voitu hakea (HTTP ${r.status})`);
    }
    value = parseFiveDay(await r.json());
  }
  setBoundedCache(forecastCache, ck, value, 1_800_000); // 30 min TTL
  return value;
}
