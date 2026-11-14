import { useEffect, useRef, useState } from "react";
import { elevationAt } from "../services/elevationService";
import { fetchWeather, type DetailedWeather } from "../services/weatherService";

export function useCursorLocationInfo(
  activeCoord: [number, number] | null,
  showElev: boolean,
  showWeather: boolean,
  owmKey: string,
) {
  const [elev, setElev] = useState<number | null>(null);
  const [weather, setWeather] = useState<DetailedWeather | null>(null);
  const [elevError, setElevError] = useState<string | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);

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

  return { elev, weather, dataError: elevError || weatherError };
}
