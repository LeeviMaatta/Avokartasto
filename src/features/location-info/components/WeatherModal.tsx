import { Cloud, Droplets, Eye, Gauge, Thermometer, Wind, X } from "lucide-react";
import type { ReactNode } from "react";
import type { DetailedWeather } from "../weatherService";

interface WeatherModalProps {
  open: boolean;
  weather: DetailedWeather | null;
  hasApiKey: boolean;
  latitude: number;
  longitude: number;
  onClose: () => void;
}

export default function WeatherModal({ open, weather, hasApiKey, latitude, longitude, onClose }: WeatherModalProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-[420px] overflow-y-auto rounded-xl bg-white p-4 text-gray-800 shadow-2xl dark:bg-gray-800 dark:text-white sm:p-5">
        <div className="mb-3 flex items-center justify-between border-b pb-2">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            {weather && <img className="h-8 w-8" src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt="" />}
            Säätiedot{weather ? `: ${weather.cityName}` : ""}
          </h3>
          <button className="text-gray-500 hover:text-black" onClick={onClose} aria-label="Sulje">
            <X size={20} />
          </button>
        </div>
        {!weather ? (
          <div className="py-6 text-center text-sm text-gray-600 dark:text-gray-300">
            {hasApiKey ? "Säätietoja ladataan..." : "Lisää OpenWeatherMap API-avain asetuksissa ja valitse sijainti kartalta."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <WeatherValue icon={<Thermometer className="text-red-500" size={18} />} label="Lämpötila">
              {weather.temp.toFixed(1)} °C (tuntuu {weather.feelsLike.toFixed(1)} °C)
            </WeatherValue>
            <WeatherValue icon={<Wind className="text-blue-500" size={18} />} label="Tuuli">
              {weather.windSpeed} m/s ({weather.windDeg}°)
            </WeatherValue>
            <WeatherValue icon={<Droplets className="text-blue-400" size={18} />} label="Kosteus">
              {weather.humidity} %
            </WeatherValue>
            <WeatherValue icon={<Gauge className="text-purple-500" size={18} />} label="Ilmanpaine">
              {weather.pressure} hPa
            </WeatherValue>
            <WeatherValue icon={<Cloud className="text-gray-500" size={18} />} label="Pilvisyys">
              {weather.clouds} %
            </WeatherValue>
            <WeatherValue icon={<Eye className="text-green-600" size={18} />} label="Näkyvyys">
              {(weather.visibility / 1000).toFixed(1)} km
            </WeatherValue>
          </div>
        )}
        {weather && <div className="mt-4 text-center text-xs text-gray-400">Koordinaatit: {latitude.toFixed(4)}°, {longitude.toFixed(4)}°</div>}
        <div className="mt-4 flex justify-end">
          <button className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700" onClick={onClose}>Sulje</button>
        </div>
      </div>
    </div>
  );
}

function WeatherValue({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-gray-700">
      {icon}
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="font-bold">{children}</div>
      </div>
    </div>
  );
}
