import { useEffect, useMemo, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import {
  COPERNICUS_MIN_YEAR,
  fetchCopernicusAvailableDates,
  fetchCopernicusAvailableDatesInRange,
  fetchCopernicusLayers,
  type CopernicusAvailableDay,
  type CopernicusDateMode,
  type CopernicusLayerInfo,
} from "../services/copernicusParams";

export function parseYearMonth(isoDate: string): { year: number; month: number } {
  const [y, m] = isoDate.split("-").map(Number);
  const now = new Date();
  return {
    year: Number.isInteger(y) && y >= COPERNICUS_MIN_YEAR ? y : now.getFullYear(),
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
  };
}

export function shiftYearMonth(ym: { year: number; month: number }, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(ym.year, ym.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

interface UseCopernicusCatalogOptions {
  copernicusActive: boolean;
  instanceId: string;
  dateMode: CopernicusDateMode;
  singleDate: string;
  centerCoord: [number, number] | null;
  maxCloud: number;
  rangeStartIso: string;
  rangeEndIso: string;
}

export function useCopernicusCatalog({
  copernicusActive,
  instanceId,
  dateMode,
  singleDate,
  centerCoord,
  maxCloud,
  rangeStartIso,
  rangeEndIso,
}: UseCopernicusCatalogOptions) {
  const [instanceLayers, setInstanceLayers] = useState<CopernicusLayerInfo[]>([]);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => parseYearMonth(singleDate));
  const [availableDays, setAvailableDays] = useState<CopernicusAvailableDay[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);

  useEffect(() => {
    if (!copernicusActive || !instanceId || (dateMode !== "single" && dateMode !== "range")) {
      setAvailableDays([]);
      setDatesError(null);
      return;
    }
    let cancelled = false;
    const [lon, lat] = centerCoord ?? [24.94, 60.17];
    setDatesLoading(true);
    setDatesError(null);
    const request = dateMode === "single"
      ? fetchCopernicusAvailableDates(instanceId, lon, lat, maxCloud, calendarMonth.year, calendarMonth.month)
      : fetchCopernicusAvailableDatesInRange(instanceId, lon, lat, maxCloud, rangeStartIso, rangeEndIso);
    void request
      .then((days) => {
        if (!cancelled) setAvailableDays(days);
      })
      .catch((err) => {
        if (!cancelled) setDatesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    copernicusActive,
    dateMode,
    instanceId,
    centerCoord?.[0],
    centerCoord?.[1],
    maxCloud,
    calendarMonth.year,
    calendarMonth.month,
    rangeStartIso,
    rangeEndIso,
  ]);

  const availableMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of availableDays) map.set(item.date, item.cloudCover);
    return map;
  }, [availableDays]);

  useEffect(() => {
    if (!copernicusActive || !instanceId) {
      setInstanceLayers([]);
      setCapabilitiesError(null);
      return;
    }
    let cancelled = false;
    setCapabilitiesError(null);
    void fetchCopernicusLayers(instanceId)
      .then((layers) => {
        if (cancelled) return;
        setInstanceLayers(layers);
        const currentLayer = useMapStore.getState().settings.copernicusLayerName || "TRUE-COLOR";
        if (layers.length > 0 && !layers.some((l) => l.name === currentLayer)) {
          const preferred =
            layers.find((l) => /true[_-]?color/i.test(l.name) || /true[_-]?color/i.test(l.title)) ??
            layers[0];
          void useMapStore.getState().setSetting("copernicusLayerName", preferred.name);
        }
      })
      .catch((err) => {
        if (!cancelled) setCapabilitiesError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [copernicusActive, instanceId]);

  return {
    instanceLayers,
    capabilitiesError,
    calendarMonth,
    setCalendarMonth,
    availableDays,
    availableMap,
    datesLoading,
    datesError,
  };
}
