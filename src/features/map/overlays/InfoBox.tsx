import { useEffect, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { toEtrs } from "../../../shared/projections";
import { elevationAt } from "../../location-info/elevationService";
import { fetchWeather, type DetailedWeather } from "../../location-info/weatherService";
import WeatherModal from "../../location-info/components/WeatherModal";

export default function InfoBox() {
  const cursor = useMapStore((s) => s.cursor);
  const centerCoord = useMapStore((s) => s.centerCoord);
  const st = useMapStore((s) => s.settings);
  const weatherModalOpen = useMapStore((s) => s.weatherModalOpen);
  const rawOverlayOpacity = Number(st.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const on = (k: string) => st[k] !== "0";

  const fetchMode = st.dataFetchMode || "mouse";
  const activeCoord = fetchMode === "center" ? centerCoord : cursor;

  const [elev, setElev] = useState<number | null>(null);
  const [weather, setWeather] = useState<DetailedWeather | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCoord || !on("showElev")) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      elevationAt(activeCoord[1], activeCoord[0], ac.signal)
        .then((value) => { setElev(value); setDataError(null); })
        .catch((error) => {
          if (!ac.signal.aborted) setDataError(`Korkeustietoa ei voitu hakea: ${String(error)}`);
        });
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
      fetchWeather(activeCoord[1], activeCoord[0], st.owmKey, ac.signal)
        .then((value) => { setWeather(value); setDataError(value ? null : "Säätietoa ei voitu hakea."); })
        .catch((error) => {
          if (!ac.signal.aborted) setDataError(`Säätietoa ei voitu hakea: ${String(error)}`);
        });
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
      <div className="pointer-events-auto absolute bottom-2 left-2 right-2 z-10 max-w-[calc(100vw-1rem)] space-y-0.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 font-mono text-xs text-slate-800 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:bottom-3 sm:left-3 sm:right-auto sm:min-w-64" style={{ opacity: overlayOpacity }}>
        <div className="mb-1 text-[10px] text-slate-500 dark:text-zinc-400">
          Lähde: {fetchMode === "center" ? "Kartan keskipiste (Osoitin)" : "Hiiren kursori"}
        </div>
        {on("showWgs") && <div>{Math.abs(lat).toFixed(4)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(4)}° {lon >= 0 ? "E" : "W"}</div>}
        {on("showEtrs") && <div>N: {Math.round(N)}, E: {Math.round(E)}</div>}
        {on("showElev") && <div>Korkeus: {elev === null ? "–" : `${Math.round(elev)} m mpy`}</div>}
        {on("showWeather") && (
          <div 
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition hover:bg-slate-100 dark:hover:bg-zinc-900"
            onClick={() => useMapStore.setState({ weatherModalOpen: true })}
            title="Klikkaa nähdäksesi tarkat säätiedot"
          >
            {st.owmKey ? (
              weather ? (
                <>
                  <img className="h-6 w-6" src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" />
                  <span>{weather.temp.toFixed(1)} °C, {weather.description}</span>
                </>
              ) : "Sää: ladataan..."
            ) : "Sää: lisää OpenWeatherMap-avain asetuksista"}
          </div>
        )}
        {dataError && <div className="mt-1 max-w-xs text-[10px] text-amber-300">{dataError}</div>}
      </div>

      <WeatherModal
        open={weatherModalOpen}
        weather={weather}
        apiKey={st.owmKey ?? ""}
        latitude={lat}
        longitude={lon}
        onClose={() => useMapStore.setState({ weatherModalOpen: false })}
      />
    </>
  );
}