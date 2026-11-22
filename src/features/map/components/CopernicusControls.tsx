import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Cloud, Satellite, Settings } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { usePersistedBool } from "../../settings/hooks/persistedUiState";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import {
  COPERNICUS_MIN_YEAR,
  formatCopernicusTimeLabel,
  isCopernicusActiveForSelection,
  resolveCopernicusRangeBounds,
  todayIsoDate,
  type CopernicusDateMode,
} from "../services/copernicusParams";
import { useCopernicusCatalog } from "../hooks/useCopernicusCatalog";
import { CopernicusCalendar } from "./copernicus/CopernicusCalendar";
import { CopernicusRangePicker } from "./copernicus/CopernicusRangePicker";
import { CopernicusLayerPicker } from "./copernicus/CopernicusLayerPicker";

const CLOUD_PRESETS = [10, 25, 50, 100];

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
  const panelRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const toggleOpenRef = useRef(toggleOpen);
  toggleOpenRef.current = toggleOpen;

  const singleDate = /^\d{4}-\d{2}-\d{2}$/.test(settings.copernicusSingleDate ?? "")
    ? settings.copernicusSingleDate
    : todayIsoDate();
  const instanceId = settings.copernicusInstanceId?.trim() ?? "";
  const maxCloud = Number.isFinite(Number(settings.copernicusMaxCloud)) ? Number(settings.copernicusMaxCloud) : 20;
  const dateMode = (settings.copernicusDateMode as CopernicusDateMode) || "latest";
  const copernicusActive = isCopernicusActiveForSelection(sources, basemap, overlays, hiddenLayers);
  const { startIso: rangeStartIso, endIso: rangeEndIso } = resolveCopernicusRangeBounds(settings);

  const {
    instanceLayers,
    capabilitiesError,
    calendarMonth,
    setCalendarMonth,
    availableDays,
    availableMap,
    datesLoading,
    datesError,
  } = useCopernicusCatalog({
    copernicusActive,
    instanceId,
    dateMode,
    singleDate,
    centerCoord,
    maxCloud,
    rangeStartIso,
    rangeEndIso,
  });

  useEffect(() => {
    const onFocusCopernicus = () => {
      if (!copernicusActive) return;
      if (!openRef.current) toggleOpenRef.current();
      window.requestAnimationFrame(() => focusFirstNavigable(panelRef.current));
    };
    window.addEventListener("kb-focus-copernicus", onFocusCopernicus);
    return () => window.removeEventListener("kb-focus-copernicus", onFocusCopernicus);
  }, [copernicusActive]);

  if (!copernicusActive) return null;

  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const hasInstanceId = Boolean(instanceId);
  const rangeStart = /^\d{2}-\d{2}$/.test(settings.copernicusRangeStart ?? "") ? settings.copernicusRangeStart : "06-01";
  const rangeEnd = /^\d{2}-\d{2}$/.test(settings.copernicusRangeEnd ?? "") ? settings.copernicusRangeEnd : "08-31";
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
      ref={panelRef}
      onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "both" })}
      className="pointer-events-auto absolute bottom-3 left-1/2 z-20 w-[min(25rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
      style={{ opacity: overlayOpacity }}
    >
      <button
        type="button"
        aria-expanded={open}
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

            {dateMode === "single" && (
              <CopernicusCalendar
                singleDate={singleDate}
                maxCloud={maxCloud}
                calendarMonth={calendarMonth}
                setCalendarMonth={setCalendarMonth}
                availableDays={availableDays}
                availableMap={availableMap}
                datesLoading={datesLoading}
                datesError={datesError}
                onSelectDate={(dateStr) => void setSetting("copernicusSingleDate", dateStr)}
              />
            )}

            {dateMode === "range" && (
              <CopernicusRangePicker
                hasInstanceId={hasInstanceId}
                maxCloud={maxCloud}
                rangeYear={rangeYear}
                currentYear={currentYear}
                years={years}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                rangeStartIso={rangeStartIso}
                rangeEndIso={rangeEndIso}
                selectedRangeDateSetting={settings.copernicusRangeSelectedDate ?? ""}
                availableDays={availableDays}
                availableMap={availableMap}
                datesLoading={datesLoading}
                datesError={datesError}
                onUpdateRangeSettings={(patch) =>
                  void setSettings({ ...settings, ...patch, copernicusRangeSelectedDate: "" })
                }
                onSelectRangeDate={(date) => void setSetting("copernicusRangeSelectedDate", date)}
              />
            )}
          </div>

          <CopernicusLayerPicker
            layerPickerOpen={layerPickerOpen}
            onToggleOpen={toggleLayerPickerOpen}
            layerName={layerName}
            instanceLayers={instanceLayers}
            capabilitiesError={capabilitiesError}
            onSelectLayer={(next) => void setSetting("copernicusLayerName", next)}
          />
        </div>
      )}
    </div>
  );
}
