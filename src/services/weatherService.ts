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

const cache = new Map<string, DetailedWeather>();

export async function fetchWeather(lat: number, lon: number, key: string, signal?: AbortSignal): Promise<DetailedWeather | null> {
  const ck = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=fi`;
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const j = await r.json();
  const w: DetailedWeather = {
    temp: j.main?.temp ?? 0,
    feelsLike: j.main?.feels_like ?? 0,
    tempMin: j.main?.temp_min ?? 0,
    tempMax: j.main?.temp_max ?? 0,
    humidity: j.main?.humidity ?? 0,
    pressure: j.main?.pressure ?? 0,
    windSpeed: j.wind?.speed ?? 0,
    windDeg: j.wind?.deg ?? 0,
    clouds: j.clouds?.all ?? 0,
    visibility: j.visibility ?? 0,
    icon: j.weather?.[0]?.icon ?? "01d",
    description: j.weather?.[0]?.description ?? "",
    cityName: j.name || "Valittu sijainti",
  };
  cache.set(ck, w);
  return w;
}