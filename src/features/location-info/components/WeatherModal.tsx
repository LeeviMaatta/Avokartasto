import { ArrowUp, Cloud, Droplets, Eye, Gauge, Wind, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { fetchForecast, type DetailedWeather, type WeatherForecast } from "../weatherService";
import WeatherForecastView from "./WeatherForecastView";

interface WeatherModalProps {
  open: boolean;
  weather: DetailedWeather | null;
  apiKey: string;
  latitude: number;
  longitude: number;
  onClose: () => void;
}

export default function WeatherModal({ open, weather, apiKey, latitude, longitude, onClose }: WeatherModalProps) {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pyöristys (0.1° / ~11 km) estää turhat haut ja käyttää samaa välimuistia InfoBoxin kanssa.
  const latKey = latitude.toFixed(1);
  const lonKey = longitude.toFixed(1);

  useEffect(() => {
    if (!open || !apiKey) return;
    const ac = new AbortController();
    setLoading(true);
    setForecastError(null);
    fetchForecast(Number(latKey), Number(lonKey), apiKey, ac.signal)
      .then((value) => setForecast(value))
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        setForecast(null);
        setForecastError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, apiKey, latKey, lonKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Säätiedot"
        className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-[720px] flex-col overflow-hidden rounded-xl bg-white text-gray-800 shadow-2xl dark:bg-gray-800 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 sm:px-5">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold">Säätiedot{weather ? `: ${weather.cityName}` : ""}</h3>
            <div className="text-xs text-gray-400">
              {latitude.toFixed(4)}°, {longitude.toFixed(4)}°
            </div>
          </div>
          <button className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-black dark:hover:bg-gray-700 dark:hover:text-white" onClick={onClose} aria-label="Sulje">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {!apiKey ? (
            <div className="py-6 text-center text-sm text-gray-600 dark:text-gray-300">Lisää OpenWeatherMap API-avain asetuksissa ja valitse sijainti kartalta.</div>
          ) : (
            <>
              {weather ? (
                <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <img className="-my-2 h-20 w-20" src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt="" />
                    <div>
                      <div className="text-4xl font-bold leading-none">{weather.temp.toFixed(1)}°</div>
                      <div className="mt-1 text-sm capitalize text-gray-600 dark:text-gray-300">{weather.description}</div>
                      <div className="text-xs text-gray-400">Tuntuu kuin {weather.feelsLike.toFixed(1)}°</div>
                    </div>
                  </div>
                  <div className="grid flex-1 grid-cols-3 gap-2 text-xs">
                    <WeatherValue icon={<Wind className="text-blue-500" size={14} />} label="Tuuli">
                      <span className="inline-flex items-center gap-1">
                        {weather.windSpeed.toFixed(1)} m/s
                        <ArrowUp size={11} className="text-gray-400" style={{ transform: `rotate(${weather.windDeg + 180}deg)` }} aria-label={`Suunta ${weather.windDeg}°`} />
                      </span>
                    </WeatherValue>
                    <WeatherValue icon={<Droplets className="text-blue-400" size={14} />} label="Kosteus">{weather.humidity} %</WeatherValue>
                    <WeatherValue icon={<Gauge className="text-purple-500" size={14} />} label="Paine">{weather.pressure} hPa</WeatherValue>
                    <WeatherValue icon={<Cloud className="text-gray-500" size={14} />} label="Pilvisyys">{weather.clouds} %</WeatherValue>
                    <WeatherValue icon={<Eye className="text-green-600" size={14} />} label="Näkyvyys">{(weather.visibility / 1000).toFixed(1)} km</WeatherValue>
                    <WeatherValue icon={<span className="text-[10px] font-bold text-red-500">↕</span>} label="Min / max">
                      {Math.round(weather.tempMin)}° / {Math.round(weather.tempMax)}°
                    </WeatherValue>
                  </div>
                </section>
              ) : (
                <div className="py-2 text-center text-sm text-gray-500">Nykyistä säätä ladataan...</div>
              )}

              {forecastError && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{forecastError}</div>}
              {loading && !forecast && <div className="py-4 text-center text-sm text-gray-500">Ennustetta ladataan...</div>}
              {forecast && <WeatherForecastView forecast={forecast} />}
            </>
          )}

          <div className="flex justify-end">
            <button className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700" onClick={onClose}>
              Sulje
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function WeatherValue({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-gray-700/60">
      <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-semibold">{children}</div>
    </div>
  );
}
