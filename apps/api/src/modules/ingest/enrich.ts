import { createRequire } from "node:module";
import type * as GeoIp from "geoip-lite";
import type { EnrichedEvent } from "@countmetrics/shared";

type Device = EnrichedEvent["device"];

// ---------- Country (offline lookup, the IP is never stored) ----------

// geoip-lite is CommonJS and loads its ~100 MB database synchronously on first require,
// so load it lazily (and let index.ts preload it at startup) instead of at import time.
let geo: typeof GeoIp | undefined;

function loadGeo(): typeof GeoIp {
  if (!geo) {
    const cjsRequire = createRequire(import.meta.url);
    geo = cjsRequire("geoip-lite") as typeof GeoIp;
  }
  return geo;
}

export function preloadGeo(): void {
  loadGeo();
}

export function lookupCountry(ip: string): string | null {
  return loadGeo().lookup(ip)?.country ?? null;
}

// ---------- User agent (small hand-written parser, no dependency) ----------

export function parseUserAgent(ua: string): { device: Device; browser: string } {
  let device: Device = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) device = "mobile";

  // Order matters: Edge, Opera and Chrome-based browsers all contain "Chrome"/"Safari"
  let browser = "Other";
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  else if (/MSIE |Trident\//.test(ua)) browser = "IE";

  return { device, browser };
}

// ---------- Privacy-minimizing normalization ----------

/** Drops query string and hash (they can contain personal data) and caps the length. */
export function normalizePath(raw: string): string {
  const end = raw.search(/[?#]/);
  const path = end === -1 ? raw : raw.slice(0, end);
  return (path.startsWith("/") ? path : `/${path}`).slice(0, 512);
}

/** Keeps only the hostname of http(s) referrers, without "www.". */
export function normalizeReferrer(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
