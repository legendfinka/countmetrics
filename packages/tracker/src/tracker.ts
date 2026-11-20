export interface Tracker {
  /** Sends a custom event. "props" is accepted but not sent yet. */
  track(name: string, props?: unknown): void;
}

export type TrackerWindow = Window & { countmetrics?: Tracker; doNotTrack?: string | null };
type DntNavigator = Navigator & { msDoNotTrack?: string | null };

/** Browsers use "1" or "yes" when the user turned on Do Not Track. */
function isDoNotTrack(win: TrackerWindow): boolean {
  const nav = win.navigator as DntNavigator;
  return [win.doNotTrack, nav.doNotTrack, nav.msDoNotTrack].some((v) => v === "1" || v === "yes");
}

/**
 * Starts the tracker.
 * The site key comes from the script tag: data-site-key (and optionally data-api).
 */
export function createTracker(win: TrackerWindow, script: HTMLScriptElement | null): Tracker {
  if (win.countmetrics) return win.countmetrics;

  const key = script ? script.getAttribute("data-site-key") : null;
  if (!script || !key || isDoNotTrack(win)) {
    // Do nothing, but keep countmetrics.track() safe to call
    win.countmetrics = { track: () => undefined };
    return win.countmetrics;
  }

  // Without data-api, send events to the server the script was loaded from
  const anchor = win.document.createElement("a");
  anchor.href = script.src;
  const api = script.getAttribute("data-api") || anchor.protocol + "//" + anchor.host;
  const url = api.replace(/\/$/, "") + "/api/event";

  const nav = win.navigator;
  const loc = win.location;
  let lastPath: string | undefined;

  function send(type: string, referrer?: string): void {
    // Only the path is sent. The query string and hash can hold personal data.
    const body = JSON.stringify({
      siteKey: key,
      type,
      path: loc.pathname,
      referrer: referrer || undefined,
    });
    try {
      // A string body is sent as text/plain, so the browser skips the CORS preflight
      if (nav.sendBeacon && nav.sendBeacon(url, body)) return;
      win
        .fetch(url, {
          method: "POST",
          body,
          keepalive: true,
          credentials: "omit",
          headers: { "Content-Type": "text/plain" },
        })
        .catch(() => undefined);
    } catch {
      // Tracking must never break the website
    }
  }

  function pageview(referrer?: string): void {
    if (loc.pathname === lastPath) return;
    lastPath = loc.pathname;
    send("pageview", referrer);
  }

  // Single-page apps change the URL without reloading, so watch the history
  const history = win.history;
  const pushState = history.pushState;
  history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    pushState.apply(this, args);
    pageview();
  };
  win.addEventListener("popstate", () => pageview());

  // Only the first pageview has a referrer
  pageview(win.document.referrer);

  win.countmetrics = { track: (name) => send(String(name)) };
  return win.countmetrics;
}
