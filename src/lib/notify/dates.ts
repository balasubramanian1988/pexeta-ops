// IST calendar helpers for reminders and reports (dates as YYYY-MM-DD).
export function istDate(d: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(typeof d === "string" ? new Date(d) : d);
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Start of an IST calendar day as an ISO timestamp. */
export function istStart(date: string) {
  return new Date(date + "T00:00:00+05:30").toISOString();
}
/** Monday of the week containing `date`. */
export function mondayOf(date: string) {
  const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
export function longDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function shortDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
export function monthName(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
