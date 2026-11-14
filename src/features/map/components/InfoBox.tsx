import { useMemo, useState } from "react";
import { Sun, Check } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import WeatherModal from "../../location-info/components/WeatherModal";
import { getSunTimes } from "../../location-info/domain/solarCalculator";
import { useCursorLocationInfo } from "../../location-info/hooks/useCursorLocationInfo";
import { formatEtrsCoords, formatWgsCoords } from "../../../shared/geo/coordinateFormatting";

export default function InfoBox() {
  const fetchMode = useMapStore((s) => s.settings.dataFetchMode || "mouse");
  const activeCoord = useMapStore((s) => ((s.settings.dataFetchMode || "mouse") === "center" ? s.centerCoord : s.cursor));
  const coordFormat = useMapStore((s) => s.settings.coordFormat ?? "decimal");
  const showWgs = useMapStore((s) => s.settings.showWgs !== "0");
  const showEtrs = useMapStore((s) => s.settings.showEtrs !== "0");
  const showElev = useMapStore((s) => s.settings.showElev !== "0");
  const showWeather = useMapStore((s) => s.settings.showWeather !== "0");
  const showSunTimes = useMapStore((s) => s.settings.showSunTimes !== "0");
  const copyCoordsOnClick = useMapStore((s) => s.settings.copyCoordsOnClick !== "0");
  const owmKey = useMapStore((s) => s.settings.owmKey ?? "");
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const weatherModalOpen = useMapStore((s) => s.weatherModalOpen);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { elev, weather, dataError } = useCursorLocationInfo(activeCoord, showElev, showWeather, owmKey);

  const handleCopy = (text: string, fieldKey: string) => {
    if (!copyCoordsOnClick) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldKey ? null : curr));
    }, 1500);
  };

  const sunTimes = useMemo(() => {
    if (!showSunTimes || !activeCoord) return null;
    return getSunTimes(activeCoord[1], activeCoord[0]);
  }, [showSunTimes, activeCoord]);

  if (!activeCoord) return null;
  const [lon, lat] = activeCoord;
  const wgsText = formatWgsCoords(lat, lon, coordFormat);
  const etrsText = formatEtrsCoords(lon, lat);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-2 left-2 right-2 z-10 max-w-[calc(100vw-1rem)] space-y-0.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 font-mono text-xs text-slate-800 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:bottom-3 sm:left-3 sm:right-auto sm:min-w-64" style={{ opacity: overlayOpacity }}>
        <div className="mb-1 text-[10px] text-slate-500 dark:text-zinc-400">
          Lähde: {fetchMode === "center" ? "Kartan keskipiste (Osoitin)" : "Hiiren kursori"}
        </div>
        {showWgs && (
          <div
            className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 transition ${
              copyCoordsOnClick ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900" : ""
            }`}
            onClick={() => handleCopy(wgsText, "wgs")}
            title={copyCoordsOnClick ? "Kopioi WGS84-koordinaatit leikepöydälle" : undefined}
          >
            <span>{wgsText}</span>
            {copiedField === "wgs" && (
              <span className="flex items-center gap-1 text-[10px] font-sans font-medium text-emerald-600 dark:text-emerald-400">
                <Check size={12} />
                Kopioitu!
              </span>
            )}
          </div>
        )}
        {showEtrs && (
          <div
            className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 transition ${
              copyCoordsOnClick ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900" : ""
            }`}
            onClick={() => handleCopy(etrsText, "etrs")}
            title={copyCoordsOnClick ? "Kopioi ETRS-TM35FIN-koordinaatit leikepöydälle" : undefined}
          >
            <span>{etrsText}</span>
            {copiedField === "etrs" && (
              <span className="flex items-center gap-1 text-[10px] font-sans font-medium text-emerald-600 dark:text-emerald-400">
                <Check size={12} />
                Kopioitu!
              </span>
            )}
          </div>
        )}
        {showElev && <div className="px-1 py-0.5">Korkeus: {elev === null ? "–" : `${Math.round(elev)} m mpy`}</div>}
        {showSunTimes && sunTimes && (
          <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
            <Sun size={13} className="shrink-0" />
            {sunTimes.isPolarDay ? (
              <span>Yötön yö (aurinko ei laske)</span>
            ) : sunTimes.isPolarNight ? (
              <span>Kaamos (aurinko ei nouse)</span>
            ) : (
              <span>Nousu {sunTimes.sunrise} · Lasku {sunTimes.sunset}</span>
            )}
          </div>
        )}
        {showWeather && (
          <div
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition hover:bg-slate-100 dark:hover:bg-zinc-900"
            onClick={() => useMapStore.setState({ weatherModalOpen: true })}
            title="Klikkaa nähdäksesi tarkat säätiedot"
          >
            {owmKey ? (
              weather ? (
                <>
                  <img className="h-6 w-6" src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" />
                  <span>{weather.temp.toFixed(1)} °C, {weather.description}</span>
                </>
              ) : "Sää: ladataan..."
            ) : "Sää: lisää OpenWeatherMap-avain asetuksista"}
          </div>
        )}
        {dataError && <div className="mt-1 max-w-xs text-[10px] text-amber-700 dark:text-amber-300">{dataError}</div>}
      </div>

      <WeatherModal
        open={weatherModalOpen}
        weather={weather}
        apiKey={owmKey}
        latitude={lat}
        longitude={lon}
        onClose={() => useMapStore.setState({ weatherModalOpen: false })}
      />
    </>
  );
}
