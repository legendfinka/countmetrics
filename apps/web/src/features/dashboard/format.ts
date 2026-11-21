import type { StatsRange } from "@countmetrics/shared";

const numbers = new Intl.NumberFormat("en");

export const formatNumber = (value: number): string => numbers.format(value);

// Times come from the API in UTC. We show them in the time zone of the browser.
// "h23" makes midnight 00:00, not 24:00.
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/** The label on the time axis of the chart. */
export function formatTick(iso: string, range: StatsRange, timeZone?: string): string {
  const options =
    range === "30d" ? DAY : range === "7d" ? { ...DAY, ...TIME } : TIME;
  return new Intl.DateTimeFormat("en", { ...options, timeZone }).format(new Date(iso));
}

/** The title of the chart tooltip. It has the date too. */
export function formatTooltip(iso: string, range: StatsRange, timeZone?: string): string {
  const options = range === "30d" ? DAY : { ...DAY, ...TIME };
  return new Intl.DateTimeFormat("en", { ...options, timeZone }).format(new Date(iso));
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "DE" becomes "🇩🇪 Germany". Anything else (like "Unknown") stays as it is. */
export function countryLabel(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  // A flag emoji is two "regional indicator" letters. 0x1f1a5 + "A" is the first one.
  const flag = String.fromCodePoint(...[...code].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
  return `${flag} ${regionNames.of(code) ?? code}`;
}

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
