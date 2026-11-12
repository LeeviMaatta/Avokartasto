export interface DetailedWeather {
  temp: number;
  feelsLike: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDeg: number;
  clouds: number;
  visibility: number;
  icon: string;
  description: string;
  cityName: string;
}
import { fetchWithDebug } from "../debug/debugFetch";

const cache = new Map<string, { value: DetailedWeather; expires: number }>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const numberAt = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Sääpalvelun vastaus sisältää virheellisen arvon: ${path}`);
  }
  return value;
};

export async function fetchWeather(lat: number, lon: number, key: string, signal?: AbortSignal): Promise<DetailedWeather | null> {
  const ck = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(ck);
  if (hit && hit.expires > Date.now()) return hit.value;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=fi`;
  const r = await fetchWithDebug(url, { signal }, "weather");
  if (!r.ok) return null;
  const j: unknown = await r.json();
  if (!isRecord(j) || !isRecord(j.main) || !isRecord(j.wind) || !isRecord(j.clouds) || !Array.isArray(j.weather)) {
    throw new Error("Sääpalvelun vastaus oli virheellisessä muodossa");
  }
  const firstWeather = j.weather[0];
  if (!isRecord(firstWeather) || typeof firstWeather.icon !== "string" || typeof firstWeather.description !== "string") {
    throw new Error("Sääpalvelun sääkuvaus puuttuu");
  }
  const w: DetailedWeather = {
    temp: numberAt(j.main.temp, "main.temp"),
    feelsLike: numberAt(j.main.feels_like, "main.feels_like"),
    tempMin: numberAt(j.main.temp_min, "main.temp_min"),
    tempMax: numberAt(j.main.temp_max, "main.temp_max"),
    humidity: numberAt(j.main.humidity, "main.humidity"),
    pressure: numberAt(j.main.pressure, "main.pressure"),
    windSpeed: numberAt(j.wind.speed, "wind.speed"),
    windDeg: numberAt(j.wind.deg, "wind.deg"),
    clouds: numberAt(j.clouds.all, "clouds.all"),
    visibility: numberAt(j.visibility, "visibility"),
    icon: firstWeather.icon,
    description: firstWeather.description,
    cityName: typeof j.name === "string" && j.name ? j.name : "Valittu sijainti",
  };
  cache.set(ck, { value: w, expires: Date.now() + 300_000 });
  return w;
}