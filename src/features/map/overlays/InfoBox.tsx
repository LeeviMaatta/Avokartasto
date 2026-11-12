import { useEffect, useMemo, useRef, useState } from "react";
import { Sun, Check } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { toEtrs } from "../../../shared/projections";
import { elevationAt } from "../../location-info/elevationService";
import { fetchWeather, type DetailedWeather } from "../../location-info/weatherService";
import WeatherModal from "../../location-info/components/WeatherModal";

function formatDms(val: number, posChar: string, negChar: string): string {
  const dir = val >= 0 ? posChar : negChar;
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);
  return `${deg}° ${min.toString().padStart(2, "0")}′ ${sec.toString().padStart(2, "0")}″ ${dir}`;
}

function getSunTimes(lat: number, lon: number, date: Date = new Date()): { sunrise: string; sunset: string; isPolarDay?: boolean; isPolarNight?: boolean } {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const zenith = 90.833;
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  const calculateTime = (isSunrise: boolean): number | "polarDay" | "polarNight" => {
    const lngHour = lon / 15;
    const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(M * D2R)) + (0.020 * Math.sin(2 * M * D2R)) + 282.634;
    L = (L + 360) % 360;
    let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R));
    RA = (RA + 360) % 360;
    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = RA + (Lquadrant - RAquadrant);
    RA = RA / 15;

    const sinDec = 0.39782 * Math.sin(L * D2R);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(zenith * D2R) - (sinDec * Math.sin(lat * D2R))) / (cosDec * Math.cos(lat * D2R));

    if (cosH > 1) return "polarNight";
    if (cosH < -1) return "polarDay";

    const H = (isSunrise ? (360 - R2D * Math.acos(cosH)) : R2D * Math.acos(cosH)) / 15;
    const T = H + RA - (0.06571 * t) - 6.622;
    const UT = ((T - lngHour + 24) % 24);
    return UT;
  };

  const riseUT = calculateTime(true);
  const setUT = calculateTime(false);

  if (riseUT === "polarDay" || setUT === "polarDay") {
    return { sunrise: "–", sunset: "–", isPolarDay: true };
  }
  if (riseUT === "polarNight" || setUT === "polarNight") {
    return { sunrise: "–", sunset: "–", isPolarNight: true };
  }

  const formatUT = (utHours: number): string => {
    const localOffsetMinutes = -date.getTimezoneOffset();
    let totalMinutes = Math.round(utHours * 60 + localOffsetMinutes);
    totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  return {
    sunrise: formatUT(riseUT as number),
    sunset: formatUT(setUT as number),
  };
}

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

  const [elev, setElev] = useState<number | null>(null);
  const [weather, setWeather] = useState<DetailedWeather | null>(null);
  const [elevError, setElevError] = useState<string | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, fieldKey: string) => {
    if (!copyCoordsOnClick) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldKey ? null : curr));
    }, 1500);
  };

  const lastElevKey = useRef<string>("");

  useEffect(() => {
    if (!showElev) {
      setElevError(null);
      return;
    }
    if (!activeCoord) return;
    const gridKey = `${activeCoord[1].toFixed(3)},${activeCoord[0].toFixed(3)}`;
    if (gridKey === lastElevKey.current && elev !== null && !elevError) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      elevationAt(activeCoord[1], activeCoord[0], ac.signal)
        .then((value) => {
          lastElevKey.current = gridKey;
          setElev(value);
          setElevError(null);
        })
        .catch((error) => {
          if (!ac.signal.aborted) setElevError(`Korkeustietoa ei voitu hakea: ${String(error)}`);
        });
    }, 500);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [activeCoord, showElev]);

  const weatherRef = useRef<DetailedWeather | null>(null);
  weatherRef.current = weather;
  const lastWeatherCoord = useRef<{ lat: number; lon: number; time: number } | null>(null);

  useEffect(() => {
    if (!showWeather || !owmKey) {
      setWeather(null);
      setWeatherError(null);
      lastWeatherCoord.current = null;
      return;
    }
    if (!activeCoord) return;
    const [lon, lat] = activeCoord;

    // Jos olemme jo hakeneet säätiedot tälle alueelle (~9 km säteellä) viimeisen 5 minuutin aikana,
    // eikä säätieto ole tyhjä, ei tehdä uutta verkkokutsua.
    if (
      weatherRef.current &&
      lastWeatherCoord.current &&
      Date.now() - lastWeatherCoord.current.time < 300_000 &&
      Math.hypot(lat - lastWeatherCoord.current.lat, lon - lastWeatherCoord.current.lon) < 0.08
    ) {
      return;
    }

    const ac = new AbortController();
    // 1000 ms debounce estää kymmenien pyyntöjen ryöpyn hiirtä kartalla liikuteltaessa (60 rpm -kiintiö)
    const t = setTimeout(() => {
      fetchWeather(lat, lon, owmKey, ac.signal)
        .then((value) => {
          if (value) {
            setWeather(value);
            setWeatherError(null);
            lastWeatherCoord.current = { lat, lon, time: Date.now() };
          } else if (!weatherRef.current) {
            setWeatherError("Säätietoa ei saatavilla tai pyyntöraja (60 rpm) saavutettu.");
          }
        })
        .catch((error) => {
          if (!ac.signal.aborted) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("429") || msg.includes("kiintiö") || msg.includes("pyyntöraja")) {
              setWeatherError("Sääpalvelun kiintiö täynnä (60 rpm), odotetaan hetki...");
            } else if (!weatherRef.current) {
              setWeatherError(`Säätietoa ei voitu hakea: ${msg}`);
            }
          }
        });
    }, 1000);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [activeCoord, showWeather, owmKey]);

  const sunTimes = useMemo(() => {
    if (!showSunTimes || !activeCoord) return null;
    return getSunTimes(activeCoord[1], activeCoord[0]);
  }, [showSunTimes, activeCoord]);

  if (!activeCoord) return null;
  const [lon, lat] = activeCoord;
  const [E, N] = toEtrs([lon, lat]);
  const dataError = elevError || weatherError;

  const wgsText = coordFormat === "dms"
    ? `${formatDms(lat, "N", "S")}, ${formatDms(lon, "E", "W")}`
    : `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  const etrsText = `N: ${Math.round(N)}, E: ${Math.round(E)}`;

  return (
    <>
      <div className="pointer-events-auto absolute bottom-2 left-2 right-2 z-10 max-w-[calc(100vw-1rem)] space-y-0.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 font-mono text-xs text-slate-800 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:bottom-3 sm:left-3 sm:right-auto sm:min-w-64" style={{ opacity: overlayOpacity }}>
        <div className="mb-1 text-[10px] text-slate-500 dark:text-zinc-400">
          Lähde: {fetchMode === "center" ? "Kartan keskipiste (Osoitin)" : "Hiiren kursori"}
        </div>
        {showWgs && (
          <div
            className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 transition ${
              copyCoordsOnClick
                ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900"
                : ""
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
              copyCoordsOnClick
                ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-900"
                : ""
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
        {dataError && <div className="mt-1 max-w-xs text-[10px] text-amber-300">{dataError}</div>}
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