import { API_URL } from "./api";

const LIVE_HOST = "countmetrics.vercel.app";
// A site key is public. Everyone can see it in the page.
const SITE_KEY = "cm_8JmQFldfcxvA";

/** CountMetrics counts its own visitors, but only on the live site. */
export function startSelfTracking(hostname: string = window.location.hostname): void {
  if (hostname !== LIVE_HOST) return;
  const script = document.createElement("script");
  script.src = `${API_URL}/tracker.js`;
  script.dataset.siteKey = SITE_KEY;
  document.head.append(script);
}
