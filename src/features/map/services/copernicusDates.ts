export type CopernicusDateMode = "latest" | "single" | "range";

export const COPERNICUS_MIN_YEAR = 2016;

export const COPERNICUS_SEASON_PRESETS: { id: string; label: string; start: string; end: string }[] = [
  { id: "spring", label: "Kevät", start: "03-01", end: "05-31" },
  { id: "summer", label: "Kesä", start: "06-01", end: "08-31" },
  { id: "autumn", label: "Syksy", start: "09-01", end: "11-30" },
  { id: "winter", label: "Talvi", start: "12-01", end: "02-28" },
  { id: "year", label: "Koko vuosi", start: "01-01", end: "12-31" },
];

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return todayIsoDate();
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function clampLeapDay(year: number, mmdd: string): string {
  if (mmdd !== "02-29") return mmdd;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? "02-29" : "02-28";
}

function normalizeMmDd(value: string | undefined, fallback: string): string {
  return /^\d{2}-\d{2}$/.test(value ?? "") ? value! : fallback;
}

export function formatFiDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Palauttaa haarukan alku- ja loppupäivän ISO-muodossa huomioiden vuodenvaihteen ja karkauspäivän. */
export function resolveCopernicusRangeBounds(settings: Record<string, string>): { startIso: string; endIso: string } {
  const currentYear = new Date().getFullYear();
  const parsedYear = Number(settings.copernicusRangeYear);
  const year = Number.isInteger(parsedYear)
    ? Math.max(COPERNICUS_MIN_YEAR, Math.min(currentYear, parsedYear))
    : currentYear;
  const startMmDd = normalizeMmDd(settings.copernicusRangeStart, "06-01");
  const endMmDd = normalizeMmDd(settings.copernicusRangeEnd, "08-31");
  const endYear = startMmDd > endMmDd ? year + 1 : year;
  return {
    startIso: `${year}-${clampLeapDay(year, startMmDd)}`,
    endIso: `${endYear}-${clampLeapDay(endYear, endMmDd)}`,
  };
}

function getSelectedRangeDate(settings: Record<string, string>, startIso: string, endIso: string): string | null {
  const candidate = settings.copernicusRangeSelectedDate ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return candidate >= startIso && candidate <= endIso ? candidate : null;
}

/** Muotoilee aktiivisen Copernicus-aikavälin luettavaan suomalaiseen muotoon. */
export function formatCopernicusTimeLabel(settings: Record<string, string>): string {
  const mode = (settings.copernicusDateMode as CopernicusDateMode) || "latest";
  if (mode === "single") {
    const single = /^\d{4}-\d{2}-\d{2}$/.test(settings.copernicusSingleDate ?? "")
      ? settings.copernicusSingleDate
      : todayIsoDate();
    return formatFiDate(single);
  }
  if (mode === "latest") return "Uusin (60 pv)";
  const { startIso, endIso } = resolveCopernicusRangeBounds(settings);
  const selectedInRange = getSelectedRangeDate(settings, startIso, endIso);
  if (selectedInRange) return formatFiDate(selectedInRange);
  return `${formatFiDate(startIso)} – ${formatFiDate(endIso)}`;
}

export function resolveCopernicusTimeRange(settings: Record<string, string>): string {
  const mode = (settings.copernicusDateMode as CopernicusDateMode) || "latest";
  if (mode === "single") {
    const single = /^\d{4}-\d{2}-\d{2}$/.test(settings.copernicusSingleDate ?? "")
      ? settings.copernicusSingleDate
      : todayIsoDate();
    return `${single}T00:00:00Z/${single}T23:59:59Z`;
  }
  if (mode === "range") {
    const { startIso, endIso } = resolveCopernicusRangeBounds(settings);
    const selectedInRange = getSelectedRangeDate(settings, startIso, endIso);
    if (selectedInRange) {
      return `${selectedInRange}T00:00:00Z/${selectedInRange}T23:59:59Z`;
    }
    return `${startIso}/${endIso}`;
  }
  const end = todayIsoDate();
  const start = addDaysIso(end, -60);
  return `${start}/${end}`;
}
