import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Cloud, Layers, Loader2, RotateCcw, Satellite, Settings } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { usePersistedBool } from "../../settings/model/persistedUiState";
import {
  COPERNICUS_LAYER_PRESETS,
  COPERNICUS_MIN_YEAR,
  COPERNICUS_SEASON_PRESETS,
  fetchCopernicusAvailableDates,
  fetchCopernicusAvailableDatesInRange,
  fetchCopernicusLayers,
  formatCopernicusTimeLabel,
  formatFiDate,
  isCopernicusActiveForSelection,
  resolveCopernicusRangeBounds,
  todayIsoDate,
  type CopernicusAvailableDay,
  type CopernicusDateMode,
  type CopernicusLayerInfo,
} from "../sources/copernicusParams";

const CLOUD_PRESETS = [10, 25, 50, 100];
const MONTH_NAMES_FI = [
  "Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
  "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu",
];
const WEEKDAYS_FI = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];

function parseYearMonth(isoDate: string): { year: number; month: number } {
  const [y, m] = isoDate.split("-").map(Number);
  const now = new Date();
  return {
    year: Number.isInteger(y) && y >= COPERNICUS_MIN_YEAR ? y : now.getFullYear(),
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
  };
}

function shiftYearMonth(ym: { year: number; month: number }, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(ym.year, ym.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default function CopernicusControls() {
  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const hiddenLayers = useMapStore((s) => s.hiddenLayers);
  const sources = useMapStore((s) => s.sources);
  const settings = useMapStore((s) => s.settings);
  const centerCoord = useMapStore((s) => s.centerCoord);
  const setSetting = useMapStore((s) => s.setSetting);
  const setSettings = useMapStore((s) => s.setSettings);
  const [open, toggleOpen] = usePersistedBool("copernicusControlsOpen", true);
  const [layerPickerOpen, toggleLayerPickerOpen] = usePersistedBool("copernicusLayerPickerOpen", true);
  const [instanceLayers, setInstanceLayers] = useState<CopernicusLayerInfo[]>([]);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const singleDate = /^\d{4}-\d{2}-\d{2}$/.test(settings.copernicusSingleDate ?? "")
    ? settings.copernicusSingleDate
    : todayIsoDate();
  const [calendarMonth, setCalendarMonth] = useState(() => parseYearMonth(singleDate));
  const [availableDays, setAvailableDays] = useState<CopernicusAvailableDay[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);

  const instanceId = settings.copernicusInstanceId?.trim() ?? "";
  const maxCloud = Number.isFinite(Number(settings.copernicusMaxCloud)) ? Number(settings.copernicusMaxCloud) : 20;
  const dateMode = (settings.copernicusDateMode as CopernicusDateMode) || "latest";
  const copernicusActive = isCopernicusActiveForSelection(sources, basemap, overlays, hiddenLayers);
  const { startIso: rangeStartIso, endIso: rangeEndIso } = resolveCopernicusRangeBounds(settings);

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

  if (!copernicusActive) return null;

  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const hasInstanceId = Boolean(settings.copernicusInstanceId?.trim());
  const rangeStart = /^\d{2}-\d{2}$/.test(settings.copernicusRangeStart ?? "")
    ? settings.copernicusRangeStart
    : "06-01";
  const rangeEnd = /^\d{2}-\d{2}$/.test(settings.copernicusRangeEnd ?? "")
    ? settings.copernicusRangeEnd
    : "08-31";
  const currentYear = new Date().getFullYear();
  const parsedYear = Number(settings.copernicusRangeYear);
  const rangeYear = Number.isInteger(parsedYear)
    ? Math.max(COPERNICUS_MIN_YEAR, Math.min(currentYear, parsedYear))
    : currentYear;
  const layerName = settings.copernicusLayerName || "TRUE-COLOR";
  const activeTimeLabel = formatCopernicusTimeLabel(settings);
  const years = Array.from({ length: currentYear - COPERNICUS_MIN_YEAR + 1 }, (_, i) => currentYear - i);

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-1/2 z-20 w-[min(25rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
      style={{ opacity: overlayOpacity }}
    >
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Satellite size={15} className="shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white">Copernicus Sentinel-2</div>
            <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
              {activeTimeLabel} • Pilvisyys ≤ {maxCloud} %
            </div>
          </div>
        </div>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-2.5 dark:border-zinc-800">
          {!hasInstanceId && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
              <span>Lisää asetuksiin ilmainen Copernicus Instance ID.</span>
              <button
                type="button"
                onClick={() => useMapStore.setState({ settingsOpen: true })}
                className="flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
              >
                <Settings size={12} /> Asetukset
              </button>
            </div>
          )}

          {/* Pilvisyys */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-zinc-200">
                <Cloud size={13} /> Max pilvisyys
              </span>
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{maxCloud} %</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={maxCloud}
              onChange={(e) => void setSetting("copernicusMaxCloud", e.target.value)}
              className="w-full accent-blue-600"
              aria-label="Maksimipilvisyys prosentteina"
            />
            <div className="flex gap-1">
              {CLOUD_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => void setSetting("copernicusMaxCloud", String(pct))}
                  className={`flex-1 rounded-md py-1 text-[11px] font-medium transition ${
                    maxCloud === pct
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {pct === 100 ? "Kaikki" : `≤ ${pct} %`}
                </button>
              ))}
            </div>
          </div>

          {/* Päivämäärätila */}
          <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-zinc-800">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-900">
              {([
                ["latest", "Uusin"],
                ["single", "Päivämäärä"],
                ["range", "Haarukka"],
              ] as [CopernicusDateMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void setSetting("copernicusDateMode", mode)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    dateMode === mode
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {dateMode === "latest" && (
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                Näyttää tuoreimman ehdot täyttävän kuvan viimeisen 60 päivän ajalta.
              </div>
            )}

            {dateMode === "single" && (() => {
              const stepFilteredDate = (direction: -1 | 1) => {
                const candidate = direction === -1
                  ? [...availableDays].reverse().find((d) => d.date < singleDate)
                  : availableDays.find((d) => d.date > singleDate);
                if (candidate) {
                  void setSetting("copernicusSingleDate", candidate.date);
                  setCalendarMonth(parseYearMonth(candidate.date));
                } else {
                  setCalendarMonth((prev) => shiftYearMonth(prev, direction * 2));
                }
              };

              const year = calendarMonth.year;
              const month = calendarMonth.month;
              const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
              const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
              const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
              const today = todayIsoDate();
              const monthMatchCount = availableDays.filter((d) => d.date.startsWith(monthPrefix)).length;
              const selectedCloud = availableMap.get(singleDate);
              const prevMatch = [...availableDays].reverse().find((d) => d.date < singleDate);
              const nextMatch = availableDays.find((d) => d.date > singleDate);

              return (
                <div
                  className="space-y-2"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      stepFilteredDate(-1);
                    } else if (e.key === "ArrowRight") {
                      e.preventDefault();
                      stepFilteredDate(1);
                    }
                  }}
                >
                  {/* Valittu päivä + nuoliaskel suodatettuihin päiviin */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => stepFilteredDate(-1)}
                      disabled={!prevMatch && year <= COPERNICUS_MIN_YEAR && month <= 1}
                      className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      title={prevMatch ? `Edellinen sopiva päivä (${prevMatch.date})` : "Hae aiempia päiviä"}
                      aria-label="Edellinen suodatettu päivä"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <div className="flex flex-1 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Calendar size={13} className="text-blue-600 dark:text-blue-400" />
                        <span>{singleDate}</span>
                      </span>
                      {selectedCloud !== undefined && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                          {Math.round(selectedCloud)} % pilviä
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => stepFilteredDate(1)}
                      disabled={!nextMatch && monthPrefix >= today.slice(0, 7)}
                      className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      title={nextMatch ? `Seuraava sopiva päivä (${nextMatch.date})` : "Hae uudempia päiviä"}
                      aria-label="Seuraava suodatettu päivä"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Kuukausikalenteri */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div className="mb-1.5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCalendarMonth((prev) => shiftYearMonth(prev, -1))}
                        disabled={year <= COPERNICUS_MIN_YEAR && month <= 1}
                        className="rounded p-1 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-zinc-800"
                        title="Edellinen kuukausi"
                        aria-label="Edellinen kuukausi"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-200">
                        {MONTH_NAMES_FI[month - 1]} {year}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCalendarMonth((prev) => shiftYearMonth(prev, 1))}
                        disabled={monthPrefix >= today.slice(0, 7)}
                        className="rounded p-1 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-zinc-800"
                        title="Seuraava kuukausi"
                        aria-label="Seuraava kuukausi"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-slate-400 dark:text-zinc-500">
                      {WEEKDAYS_FI.map((wd) => <div key={wd} className="py-0.5">{wd}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
                      {Array.from({ length: firstWeekday }, (_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const dateStr = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                        const cc = availableMap.get(dateStr);
                        const isSelected = dateStr === singleDate;
                        const isFuture = dateStr > today;
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={isFuture}
                            onClick={() => void setSetting("copernicusSingleDate", dateStr)}
                            title={
                              cc !== undefined
                                ? `${dateStr} • Pilvisyys ${Math.round(cc)} %`
                                : `${dateStr} • Ei kuvaa alle ${maxCloud} % pilvisyydellä`
                            }
                            className={`relative rounded py-1 transition ${
                              isFuture
                                ? "pointer-events-none text-slate-300 dark:text-zinc-700"
                                : isSelected
                                  ? "bg-blue-600 font-semibold text-white shadow-xs"
                                  : cc !== undefined
                                    ? "bg-emerald-100 font-semibold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:hover:bg-emerald-900/80"
                                    : "text-slate-400 hover:bg-slate-200/70 dark:text-zinc-500 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                      {datesLoading ? (
                        <span className="flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin" /> Haetaan sopivia päiviä...
                        </span>
                      ) : datesError ? (
                        <span className="text-amber-600 dark:text-amber-400">{datesError}</span>
                      ) : (
                        <span>
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1 align-middle" />
                          {monthMatchCount} sopivaa päivää (≤ {maxCloud} %)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {dateMode === "range" && (() => {
              const rawSelectedRange = settings.copernicusRangeSelectedDate ?? "";
              const selectedRangeDate =
                /^\d{4}-\d{2}-\d{2}$/.test(rawSelectedRange) &&
                rawSelectedRange >= rangeStartIso &&
                rawSelectedRange <= rangeEndIso
                  ? rawSelectedRange
                  : "";
              const selectedIndex = selectedRangeDate
                ? availableDays.findIndex((d) => d.date === selectedRangeDate)
                : -1;
              const selectedRangeCloud = selectedRangeDate ? availableMap.get(selectedRangeDate) : undefined;
              const prevRangeDay = selectedRangeDate
                ? [...availableDays].reverse().find((d) => d.date < selectedRangeDate)
                : availableDays[availableDays.length - 1];
              const nextRangeDay = selectedRangeDate
                ? availableDays.find((d) => d.date > selectedRangeDate)
                : availableDays[0];

              const updateRangeSettings = (patch: Record<string, string>) => {
                void setSettings({
                  ...settings,
                  ...patch,
                  copernicusRangeSelectedDate: "",
                });
              };

              const stepRangeDay = (direction: -1 | 1) => {
                const candidate = direction === -1 ? prevRangeDay : nextRangeDay;
                if (candidate) {
                  void setSetting("copernicusRangeSelectedDate", candidate.date);
                }
              };

              return (
                <div className="space-y-2.5">
                  {/* Vuosi ja pikavalinnat */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-zinc-300">Vuosi & jakso</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={rangeYear <= COPERNICUS_MIN_YEAR}
                        onClick={() => updateRangeSettings({ copernicusRangeYear: String(rangeYear - 1) })}
                        className="rounded-md border border-slate-300 p-1 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        title="Edellinen vuosi"
                        aria-label="Edellinen vuosi"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <select
                        value={rangeYear}
                        onChange={(e) => updateRangeSettings({ copernicusRangeYear: e.target.value })}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        aria-label="Valitse vuosi"
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={rangeYear >= currentYear}
                        onClick={() => updateRangeSettings({ copernicusRangeYear: String(rangeYear + 1) })}
                        className="rounded-md border border-slate-300 p-1 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        title="Seuraava vuosi"
                        aria-label="Seuraava vuosi"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Vuodenaikapikavalinnat */}
                  <div className="flex flex-wrap gap-1">
                    {COPERNICUS_SEASON_PRESETS.map((preset) => {
                      const active = rangeStart === preset.start && rangeEnd === preset.end;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            updateRangeSettings({
                              copernicusRangeStart: preset.start,
                              copernicusRangeEnd: preset.end,
                            })
                          }
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                            active
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Haarukan alku ja loppu */}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-0.5 text-[11px] text-slate-600 dark:text-zinc-300">
                      <span>Alkupäivä</span>
                      <input
                        type="date"
                        min={`${COPERNICUS_MIN_YEAR}-01-01`}
                        max={todayIsoDate()}
                        value={rangeStartIso}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
                          const nextYear = Math.max(COPERNICUS_MIN_YEAR, Math.min(currentYear, Number(next.slice(0, 4))));
                          updateRangeSettings({
                            copernicusRangeYear: String(nextYear),
                            copernicusRangeStart: next.slice(5, 10),
                          });
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        aria-label="Haarukan alkupäivä"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[11px] text-slate-600 dark:text-zinc-300">
                      <span>Loppupäivä</span>
                      <input
                        type="date"
                        min={`${COPERNICUS_MIN_YEAR}-01-01`}
                        max={`${currentYear + 1}-12-31`}
                        value={rangeEndIso}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
                          const nextMmDd = next.slice(5, 10);
                          if (next < rangeStartIso) {
                            const nextYear = Math.max(COPERNICUS_MIN_YEAR, Math.min(currentYear, Number(next.slice(0, 4))));
                            updateRangeSettings({
                              copernicusRangeYear: String(nextYear),
                              copernicusRangeStart: nextMmDd,
                              copernicusRangeEnd: nextMmDd,
                            });
                            return;
                          }
                          updateRangeSettings({ copernicusRangeEnd: nextMmDd });
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        aria-label="Haarukan loppupäivä"
                      />
                    </label>
                  </div>

                  {/* Selaa sopivia kuvapäiviä haarukan sisällä */}
                  <div
                    className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/60"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        stepRangeDay(-1);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        stepRangeDay(1);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => stepRangeDay(-1)}
                        disabled={!hasInstanceId || datesLoading || !prevRangeDay}
                        className="rounded-md border border-slate-300 bg-white p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        title={prevRangeDay ? `Edellinen sopiva päivä (${formatFiDate(prevRangeDay.date)})` : "Ei aiempaa sopivaa päivää haarukassa"}
                        aria-label="Edellinen suodatettu päivä haarukassa"
                      >
                        <ChevronLeft size={14} />
                      </button>

                      <div className="flex flex-1 items-center justify-between gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                        {selectedRangeDate ? (
                          <>
                            <span className="flex items-center gap-1.5 font-medium">
                              <Calendar size={13} className="text-blue-600 dark:text-blue-400" />
                              <span>{formatFiDate(selectedRangeDate)}</span>
                              {selectedIndex >= 0 && (
                                <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                                  ({selectedIndex + 1}/{availableDays.length})
                                </span>
                              )}
                            </span>
                            {selectedRangeCloud !== undefined && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                {Math.round(selectedRangeCloud)} %
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="flex w-full items-center justify-between text-[11px] font-medium text-slate-700 dark:text-zinc-200">
                            <span>Koko haarukka</span>
                            <span className="text-slate-500 dark:text-zinc-400">
                              {formatFiDate(rangeStartIso)} – {formatFiDate(rangeEndIso)}
                            </span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => stepRangeDay(1)}
                        disabled={!hasInstanceId || datesLoading || !nextRangeDay}
                        className="rounded-md border border-slate-300 bg-white p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        title={nextRangeDay ? `Seuraava sopiva päivä (${formatFiDate(nextRangeDay.date)})` : "Ei uudempaa sopivaa päivää haarukassa"}
                        aria-label="Seuraava suodatettu päivä haarukassa"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-zinc-400">
                      {!hasInstanceId ? (
                        <span>Lisää Instance ID nähdäksesi kuvapäivät.</span>
                      ) : datesLoading ? (
                        <span className="flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin" /> Haetaan sopivia päiviä...
                        </span>
                      ) : datesError ? (
                        <span className="text-amber-600 dark:text-amber-400">{datesError}</span>
                      ) : (
                        <span>
                          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />
                          {availableDays.length} sopivaa päivää (≤ {maxCloud} %)
                        </span>
                      )}
                      {selectedRangeDate && (
                        <button
                          type="button"
                          onClick={() => void setSetting("copernicusRangeSelectedDate", "")}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
                          title="Palaa koko haarukan parhaaseen kuvaan"
                        >
                          <RotateCcw size={10} /> Koko haarukka
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Kuvatyyppi / WMS-kerros */}
          <div className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-zinc-800">
            <button
              type="button"
              onClick={toggleLayerPickerOpen}
              className="flex w-full items-center justify-between gap-2 text-left font-medium text-slate-700 hover:text-slate-900 dark:text-zinc-200 dark:hover:text-white"
              aria-expanded={layerPickerOpen}
            >
              <span className="flex items-center gap-1.5">
                <Layers size={13} /> Kuvatyyppi (WMS-kerros)
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                <span className="max-w-28 truncate font-mono">{layerName}</span>
                {layerPickerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
            {layerPickerOpen && (
              <>
                {capabilitiesError && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400">
                    Kerroslistan haku epäonnistui: {capabilitiesError}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {(instanceLayers.length > 0
                    ? instanceLayers.map((l) => ({ id: l.name, label: l.title }))
                    : COPERNICUS_LAYER_PRESETS
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void setSetting("copernicusLayerName", preset.id)}
                      title={preset.id}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        layerName === preset.id
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={layerName}
                  onChange={(e) => void setSetting("copernicusLayerName", e.target.value)}
                  placeholder="WMS-kerroksen nimi (esim. TRUE-COLOR)"
                  aria-label="Copernicus WMS-kerroksen nimi"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
