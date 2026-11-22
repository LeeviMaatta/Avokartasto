import { Calendar, ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import {
  COPERNICUS_MIN_YEAR,
  COPERNICUS_SEASON_PRESETS,
  formatFiDate,
  todayIsoDate,
  type CopernicusAvailableDay,
} from "../../services/copernicusParams";

interface CopernicusRangePickerProps {
  hasInstanceId: boolean;
  maxCloud: number;
  rangeYear: number;
  currentYear: number;
  years: number[];
  rangeStart: string;
  rangeEnd: string;
  rangeStartIso: string;
  rangeEndIso: string;
  selectedRangeDateSetting: string;
  availableDays: CopernicusAvailableDay[];
  availableMap: Map<string, number>;
  datesLoading: boolean;
  datesError: string | null;
  onUpdateRangeSettings: (patch: Record<string, string>) => void;
  onSelectRangeDate: (date: string) => void;
}

export function CopernicusRangePicker({
  hasInstanceId,
  maxCloud,
  rangeYear,
  currentYear,
  years,
  rangeStart,
  rangeEnd,
  rangeStartIso,
  rangeEndIso,
  selectedRangeDateSetting,
  availableDays,
  availableMap,
  datesLoading,
  datesError,
  onUpdateRangeSettings,
  onSelectRangeDate,
}: CopernicusRangePickerProps) {
  const selectedRangeDate =
    /^\d{4}-\d{2}-\d{2}$/.test(selectedRangeDateSetting) &&
    selectedRangeDateSetting >= rangeStartIso &&
    selectedRangeDateSetting <= rangeEndIso
      ? selectedRangeDateSetting
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

  const stepRangeDay = (direction: -1 | 1) => {
    const candidate = direction === -1 ? prevRangeDay : nextRangeDay;
    if (candidate) {
      onSelectRangeDate(candidate.date);
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
            onClick={() => onUpdateRangeSettings({ copernicusRangeYear: String(rangeYear - 1) })}
            className="rounded-md border border-slate-300 p-1 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title="Edellinen vuosi"
            aria-label="Edellinen vuosi"
          >
            <ChevronLeft size={13} />
          </button>
          <select
            value={rangeYear}
            onChange={(e) => onUpdateRangeSettings({ copernicusRangeYear: e.target.value })}
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
            onClick={() => onUpdateRangeSettings({ copernicusRangeYear: String(rangeYear + 1) })}
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
                onUpdateRangeSettings({
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
              onUpdateRangeSettings({
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
                onUpdateRangeSettings({
                  copernicusRangeYear: String(nextYear),
                  copernicusRangeStart: nextMmDd,
                  copernicusRangeEnd: nextMmDd,
                });
                return;
              }
              onUpdateRangeSettings({ copernicusRangeEnd: nextMmDd });
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
              onClick={() => onSelectRangeDate("")}
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
}
