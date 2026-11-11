import { useEffect, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { toEtrs } from "../../../projections";
import { elevationAt } from "../../../services/elevationService";
import { fetchWeather, type DetailedWeather } from "../../../services/weatherService";
import { X, Wind, Droplets, Gauge, Cloud, Eye, Thermometer } from "lucide-react";

export default function InfoBox() {
  const cursor = useMapStore((s) => s.cursor);
  const centerCoord = useMapStore((s) => s.centerCoord);
  const st = useMapStore((s) => s.settings);
  const weatherModalOpen = useMapStore((s) => s.weatherModalOpen);
  const on = (k: string) => st[k] !== "0";

  const fetchMode = st.dataFetchMode || "mouse";
  const activeCoord = fetchMode === "center" ? centerCoord : cursor;

  const [elev, setElev] = useState<number | null>(null);
  const [weather, setWeather] = useState<DetailedWeather | null>(null);

  useEffect(() => {
    if (!activeCoord || !on("showElev")) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      elevationAt(activeCoord[1], activeCoord[0], ac.signal).then(setElev).catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [activeCoord, st.showElev]);

  useEffect(() => {
    if (!activeCoord || !on("showWeather") || !st.owmKey) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetchWeather(activeCoord[1], activeCoord[0], st.owmKey, ac.signal).then(setWeather).catch(() => {});
    }, 500);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [activeCoord, st.showWeather, st.owmKey]);

  if (!activeCoord) return null;
  const [lon, lat] = activeCoord;
  const [E, N] = toEtrs([lon, lat]);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-3 left-3 z-10 min-w-64 space-y-0.5 rounded-lg bg-black/80 px-3 py-2 font-mono text-xs text-white shadow-lg backdrop-blur">
        <div className="text-[10px] text-blue-300 mb-1">
          Lähde: {fetchMode === "center" ? "Kartan keskipiste (Ristiain)" : "Hiiren kursori"}
        </div>
        {on("showWgs") && <div>{Math.abs(lat).toFixed(4)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(4)}° {lon >= 0 ? "E" : "W"}</div>}
        {on("showEtrs") && <div>N: {Math.round(N)}, E: {Math.round(E)}</div>}
        {on("showElev") && <div>Korkeus: {elev === null ? "–" : `${Math.round(elev)} m mpy`}</div>}
        {on("showWeather") && (
          <div 
            className="flex items-center gap-1 cursor-pointer hover:bg-white/10 rounded px-1 py-0.5 transition"
            onClick={() => useMapStore.setState({ weatherModalOpen: true })}
            title="Klikkaa nähdäksesi tarkat säätiedot"
          >
            {st.owmKey ? (
              weather ? (
                <>
                  <img className="h-6 w-6" src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" />
                  <span>{weather.temp.toFixed(1)} °C, {weather.description} (Klikkaa lisätiedot)</span>
                </>
              ) : "Sää: ladataan..."
            ) : "Sää: lisää OpenWeatherMap-avain asetuksista"}
          </div>
        )}
      </div>

      {weatherModalOpen && weather && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[420px] rounded-xl bg-white p-5 text-gray-800 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <img className="h-8 w-8" src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt="" />
                Säätiedot: {weather.cityName}
              </h3>
              <button className="text-gray-500 hover:text-black" onClick={() => useMapStore.setState({ weatherModalOpen: false })}>
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg">
                <Thermometer className="text-red-500" size={18} />
                <div>
                  <div className="text-xs text-gray-500">Lämpötila</div>
                  <div className="font-bold">{weather.temp.toFixed(1)} °C (tuntuu {weather.feelsLike.toFixed(1)} °C)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg">
                <Wind className="text-blue-500" size={18} />
                <div>
                  <div className="text-xs text-gray-500">Tuuli</div>
                  <div className="font-bold">{weather.windSpeed} m/s ({weather.windDeg}°)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg">
                <Droplets className="text-blue-400" size={18} />
                <div>
                  <div className="text-xs text-gray-500">Kosteus</div>
                  <div className="font-bold">{weather.humidity} %</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg">
                <Gauge className="text-purple-500" size={18} />
                <div>
                  <div className="text-xs text-gray-500">Ilmanpaine</div>
                  <div className="font-bold">{weather.pressure} hPa</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg">
                <Cloud className="text-gray-500" size={18} />
                <div>
                  <div className="text-xs text-gray-500">Pilvisyys</div>
                  <div className="font-bold">{weather.clouds} %</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg">
                <Eye className="text-green-600" size={18} />
                <div>
                  <div className="text-xs text-gray-500">Näkyvyys</div>
                  <div className="font-bold">{(weather.visibility / 1000).toFixed(1)} km</div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-center text-xs text-gray-400">
              Koordinaatit: {lat.toFixed(4)}°, {lon.toFixed(4)}°
            </div>
            <div className="mt-4 flex justify-end">
              <button 
                className="rounded bg-blue-600 px-4 py-1.5 text-white text-sm font-medium hover:bg-blue-700" 
                onClick={() => useMapStore.setState({ weatherModalOpen: false })}
              >
                Sulje
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}