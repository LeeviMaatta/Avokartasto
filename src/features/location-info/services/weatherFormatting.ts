/** Muotoilee sijainnin paikallisen ajan. */
export function formatLocalTime(unixSeconds: number, timezoneOffset: number, options: Intl.DateTimeFormatOptions): string {
  return new Date((unixSeconds + timezoneOffset) * 1000).toLocaleString("fi-FI", { ...options, timeZone: "UTC" });
}
