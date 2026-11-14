import { Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { COPERNICUS_MIN_YEAR, todayIsoDate, type CopernicusAvailableDay } from "../../services/copernicusParams";
import { parseYearMonth, shiftYearMonth } from "../../hooks/useCopernicusCatalog";

const MONTH_NAMES_FI = [
  "Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
  "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu",
];
const WEEKDAYS_FI = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];

interface CopernicusCalendarProps {
  singleDate: string;
  maxCloud: number;
  calendarMonth: { year: number; month: number };
  setCalendarMonth: React.Dispatch<React.SetStateAction<{ year: number; month: number }>>;
  availableDays: CopernicusAvailableDay[];
  availableMap: Map<string, number>;
  datesLoading: boolean;
  datesError: string | null;
  onSelectDate: (dateStr: string) => void;
}

export function CopernicusCalendar({
  singleDate,
  maxCloud,
  calendarMonth,
  setCalendarMonth,
  availableDays,
  availableMap,
  datesLoading,
  datesError,
  onSelectDate,
}: CopernicusCalendarProps) {
  const stepFilteredDate = (direction: -1 | 1) => {
    const candidate = direction === -1
      ? [...availableDays].reverse().find((d) => d.date < singleDate)
      : availableDays.find((d) => d.date > singleDate);
    if (candidate) {
      onSelectDate(candidate.date);
      setCalendarMonth(parseYearMonth(candidate.date));
    } else {
      setCalendarMonth((prev) => shiftYearMonth(prev, direction * 2));
    }
  };

  const { year, month } = calendarMonth;
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
                onClick={() => onSelectDate(dateStr)}
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
}
