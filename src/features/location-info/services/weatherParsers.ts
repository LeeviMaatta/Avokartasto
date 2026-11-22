import {
  FORECAST_DAYS,
  type DetailedWeather,
  type ForecastDay,
  type ForecastHour,
  type WeatherForecast,
} from "../model/weatherTypes";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const numberAt = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Sääpalvelun vastaus sisältää virheellisen arvon: ${path}`);
  }
  return value;
};

const optionalNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const volumeAt = (value: unknown, key: "1h" | "3h"): number =>
  (isRecord(value) ? optionalNumber(value[key]) ?? 0 : 0);

const weatherDescAt = (value: unknown, path: string): { icon: string; description: string } => {
  const w = Array.isArray(value) ? value[0] : undefined;
  if (!isRecord(w) || typeof w.icon !== "string" || typeof w.description !== "string") {
    throw new Error(`Sääpalvelun sääkuvaus puuttuu: ${path}`);
  }
  return { icon: w.icon, description: w.description };
};

const localDayKey = (unixSeconds: number, tz: number) =>
  new Date((unixSeconds + tz) * 1000).toISOString().slice(0, 10);

const localHour = (unixSeconds: number, tz: number) =>
  new Date((unixSeconds + tz) * 1000).getUTCHours();

export function parseCurrentWeather(j: unknown): DetailedWeather {
  if (!isRecord(j) || !isRecord(j.main) || !isRecord(j.wind) || !isRecord(j.clouds) || !Array.isArray(j.weather)) {
    throw new Error("Sääpalvelun vastaus oli virheellisessä muodossa");
  }
  const firstWeather = j.weather[0];
  if (!isRecord(firstWeather) || typeof firstWeather.icon !== "string" || typeof firstWeather.description !== "string") {
    throw new Error("Sääpalvelun sääkuvaus puuttuu");
  }
  return {
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
}

export function parseOneCall(j: unknown): WeatherForecast {
  if (!isRecord(j) || !Array.isArray(j.daily)) throw new Error("Sääennusteen vastaus oli virheellisessä muodossa");
  const tz = numberAt(j.timezone_offset, "timezone_offset");
  const hours: ForecastHour[] = (Array.isArray(j.hourly) ? j.hourly : []).map((h: unknown, i: number) => {
    const p = `hourly[${i}]`;
    if (!isRecord(h)) throw new Error(`Sääennusteen rivi on virheellinen: ${p}`);
    return {
      time: numberAt(h.dt, `${p}.dt`),
      temp: numberAt(h.temp, `${p}.temp`),
      feelsLike: numberAt(h.feels_like, `${p}.feels_like`),
      ...weatherDescAt(h.weather, p),
      pop: optionalNumber(h.pop) ?? 0,
      precipitation: volumeAt(h.rain, "1h") + volumeAt(h.snow, "1h"),
      windSpeed: numberAt(h.wind_speed, `${p}.wind_speed`),
      windDeg: numberAt(h.wind_deg, `${p}.wind_deg`),
      windGust: optionalNumber(h.wind_gust),
      humidity: numberAt(h.humidity, `${p}.humidity`),
    };
  });

  const days: ForecastDay[] = j.daily.slice(0, FORECAST_DAYS).map((d: unknown, i: number) => {
    const p = `daily[${i}]`;
    if (!isRecord(d) || !isRecord(d.temp)) throw new Error(`Sääennusteen päivä on virheellinen: ${p}`);
    const time = numberAt(d.dt, `${p}.dt`);
    const key = localDayKey(time, tz);
    return {
      key,
      time,
      tempMin: numberAt(d.temp.min, `${p}.temp.min`),
      tempMax: numberAt(d.temp.max, `${p}.temp.max`),
      ...weatherDescAt(d.weather, p),
      pop: optionalNumber(d.pop) ?? 0,
      // Päiväennusteessa rain/snow ovat suoraan millimetrejä.
      precipitation: (optionalNumber(d.rain) ?? 0) + (optionalNumber(d.snow) ?? 0),
      windSpeed: numberAt(d.wind_speed, `${p}.wind_speed`),
      windDeg: numberAt(d.wind_deg, `${p}.wind_deg`),
      humidity: numberAt(d.humidity, `${p}.humidity`),
      sunrise: optionalNumber(d.sunrise),
      sunset: optionalNumber(d.sunset),
      uvi: optionalNumber(d.uvi),
      parts: {
        morn: numberAt(d.temp.morn, `${p}.temp.morn`),
        day: numberAt(d.temp.day, `${p}.temp.day`),
        eve: numberAt(d.temp.eve, `${p}.temp.eve`),
        night: numberAt(d.temp.night, `${p}.temp.night`),
      },
      hours: hours.filter((h) => localDayKey(h.time, tz) === key),
    };
  });
  return { source: "onecall", timezoneOffset: tz, days };
}

export function parseFiveDay(j: unknown): WeatherForecast {
  if (!isRecord(j) || !Array.isArray(j.list) || !isRecord(j.city)) {
    throw new Error("Sääennusteen vastaus oli virheellisessä muodossa");
  }
  const tz = optionalNumber(j.city.timezone) ?? 0;
  const sunrise = optionalNumber(j.city.sunrise);
  const sunset = optionalNumber(j.city.sunset);

  const groups = new Map<string, { hour: ForecastHour; min: number; max: number }[]>();
  j.list.forEach((item: unknown, i: number) => {
    const p = `list[${i}]`;
    if (!isRecord(item) || !isRecord(item.main) || !isRecord(item.wind)) throw new Error(`Sääennusteen rivi on virheellinen: ${p}`);
    const hour: ForecastHour = {
      time: numberAt(item.dt, `${p}.dt`),
      temp: numberAt(item.main.temp, `${p}.main.temp`),
      feelsLike: numberAt(item.main.feels_like, `${p}.main.feels_like`),
      ...weatherDescAt(item.weather, p),
      pop: optionalNumber(item.pop) ?? 0,
      precipitation: volumeAt(item.rain, "3h") + volumeAt(item.snow, "3h"),
      windSpeed: numberAt(item.wind.speed, `${p}.wind.speed`),
      windDeg: numberAt(item.wind.deg, `${p}.wind.deg`),
      windGust: optionalNumber(item.wind.gust),
      humidity: numberAt(item.main.humidity, `${p}.main.humidity`),
    };
    const entry = { hour, min: numberAt(item.main.temp_min, `${p}.main.temp_min`), max: numberAt(item.main.temp_max, `${p}.main.temp_max`) };
    const key = localDayKey(hour.time, tz);
    const g = groups.get(key);
    if (g) g.push(entry);
    else groups.set(key, [entry]);
  });

  const days: ForecastDay[] = [...groups.entries()].slice(0, FORECAST_DAYS).map(([key, g], index) => {
    const hours = g.map((e) => e.hour);
    // Päivän symboli: paikallista keskipäivää lähin jakso.
    const rep = hours.reduce((best, h) => (Math.abs(localHour(h.time, tz) - 13) < Math.abs(localHour(best.time, tz) - 13) ? h : best), hours[0]);
    const windiest = hours.reduce((best, h) => (h.windSpeed > best.windSpeed ? h : best), hours[0]);
    return {
      key,
      time: hours[0].time,
      tempMin: Math.min(...g.map((e) => e.min)),
      tempMax: Math.max(...g.map((e) => e.max)),
      icon: rep.icon.replace(/n$/, "d"),
      description: rep.description,
      pop: Math.max(...hours.map((h) => h.pop)),
      precipitation: hours.reduce((sum, h) => sum + h.precipitation, 0),
      windSpeed: windiest.windSpeed,
      windDeg: windiest.windDeg,
      humidity: Math.round(hours.reduce((sum, h) => sum + h.humidity, 0) / hours.length),
      // city.sunrise/sunset koskevat vain kuluvaa päivää.
      sunrise: index === 0 ? sunrise : null,
      sunset: index === 0 ? sunset : null,
      uvi: null,
      parts: null,
      hours,
    };
  });
  return { source: "forecast", timezoneOffset: tz, days };
}
