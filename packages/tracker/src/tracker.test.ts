import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTracker, type TrackerWindow } from "./tracker";

const SITE_KEY = "cm_testkey00001";
const API_URL = "https://api.example.com/api/event";
const nativePushState = history.pushState;
const win = window as TrackerWindow;

let beacon: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let listeners: [string, EventListenerOrEventListenerObject][];

function setBrowserValue(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

/** A script tag like the one a customer would paste. */
function makeScript(attributes: Record<string, string> = { "data-site-key": SITE_KEY }) {
  const script = document.createElement("script");
  script.src = "https://api.example.com/tracker.js";
  for (const name of Object.keys(attributes)) script.setAttribute(name, attributes[name] ?? "");
  return script;
}

const start = (script: HTMLScriptElement | null = makeScript()) => createTracker(win, script);

/** The JSON bodies that were sent with sendBeacon. */
const sent = () => beacon.mock.calls.map(([, body]) => JSON.parse(body as string) as unknown);

beforeEach(() => {
  history.replaceState(null, "", "/start");
  delete win.countmetrics;

  beacon = vi.fn(() => true);
  fetchMock = vi.fn(() => Promise.resolve());
  setBrowserValue(navigator, "sendBeacon", beacon);
  setBrowserValue(navigator, "doNotTrack", null);
  setBrowserValue(navigator, "msDoNotTrack", null);
  setBrowserValue(window, "doNotTrack", null);
  setBrowserValue(window, "fetch", fetchMock);
  setBrowserValue(document, "referrer", "");

  // Remember the listeners the tracker adds, so afterEach can remove them
  listeners = [];
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    listeners.push([type, listener]);
    add(type, listener, options);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [type, listener] of listeners) window.removeEventListener(type, listener);
  history.pushState = nativePushState;
});

describe("pageviews", () => {
  it("sends a pageview when it starts", () => {
    start();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]?.[0]).toBe(API_URL);
    expect(sent()).toEqual([{ siteKey: SITE_KEY, type: "pageview", path: "/start" }]);
  });

  it("sends the referrer, only with the first pageview", () => {
    setBrowserValue(document, "referrer", "https://google.com/search?q=x");
    start();
    history.pushState(null, "", "/about");

    expect(sent()).toEqual([
      { siteKey: SITE_KEY, type: "pageview", path: "/start", referrer: "https://google.com/search?q=x" },
      { siteKey: SITE_KEY, type: "pageview", path: "/about" },
    ]);
  });

  it("sends only the path, without query string and hash", () => {
    history.replaceState(null, "", "/pricing?plan=pro&email=a@b.com#top");
    start();
    expect(sent()).toEqual([{ siteKey: SITE_KEY, type: "pageview", path: "/pricing" }]);
  });
});

describe("single-page navigation", () => {
  it("sends a pageview when pushState changes the path", () => {
    start();
    history.pushState(null, "", "/about");
    expect(sent().map((e) => (e as { path: string }).path)).toEqual(["/start", "/about"]);
  });

  it("does not send the same path twice", () => {
    start();
    history.pushState(null, "", "/start");
    history.pushState(null, "", "/start?tab=2");
    history.pushState(null, "", "/start#section");
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("does not send a pageview for replaceState", () => {
    start();
    history.replaceState(null, "", "/redirected");
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("sends a pageview when the user goes back", () => {
    start();
    history.pushState(null, "", "/about");
    history.replaceState(null, "", "/start"); // the browser changes the URL before popstate
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(sent().map((e) => (e as { path: string }).path)).toEqual(["/start", "/about", "/start"]);
  });

  it("still does the real pushState", () => {
    start();
    history.pushState({ a: 1 }, "", "/about");
    expect(location.pathname).toBe("/about");
    expect(history.state).toEqual({ a: 1 });
  });
});

describe("custom events", () => {
  it("sends a custom event with the current path", () => {
    const tracker = start();
    beacon.mockClear();

    tracker.track("signup");

    expect(sent()).toEqual([{ siteKey: SITE_KEY, type: "signup", path: "/start" }]);
  });

  it("is available as window.countmetrics", () => {
    start();
    expect(typeof win.countmetrics?.track).toBe("function");
  });

  it("accepts props but does not send them yet", () => {
    const tracker = start();
    beacon.mockClear();
    tracker.track("signup", { plan: "pro" });
    expect(JSON.stringify(sent())).not.toContain("pro");
  });
});

describe("sending", () => {
  it("uses fetch with keepalive when sendBeacon does not exist", () => {
    setBrowserValue(navigator, "sendBeacon", undefined);
    start();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(API_URL);
    expect(options).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(JSON.parse(options.body as string)).toMatchObject({ siteKey: SITE_KEY, type: "pageview" });
  });

  it("uses fetch when sendBeacon refuses the data", () => {
    beacon.mockReturnValue(false);
    start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws, even if sending fails", () => {
    beacon.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => start().track("signup")).not.toThrow();

    delete win.countmetrics;
    setBrowserValue(navigator, "sendBeacon", undefined);
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    expect(() => start().track("signup")).not.toThrow();
  });

  it("sends to the server the script came from", () => {
    start(makeScript({ "data-site-key": SITE_KEY }));
    expect(beacon.mock.calls[0]?.[0]).toBe("https://api.example.com/api/event");
  });

  it("uses data-api when it is set (and ignores a trailing slash)", () => {
    start(makeScript({ "data-site-key": SITE_KEY, "data-api": "http://localhost:3000/" }));
    expect(beacon.mock.calls[0]?.[0]).toBe("http://localhost:3000/api/event");
  });
});

describe("Do Not Track", () => {
  it.each([
    ["navigator.doNotTrack = 1", () => setBrowserValue(navigator, "doNotTrack", "1")],
    ["navigator.doNotTrack = yes", () => setBrowserValue(navigator, "doNotTrack", "yes")],
    ["navigator.msDoNotTrack = 1", () => setBrowserValue(navigator, "msDoNotTrack", "1")],
    ["window.doNotTrack = 1", () => setBrowserValue(window, "doNotTrack", "1")],
  ])("sends nothing when %s", (_name, turnOn) => {
    turnOn();
    const tracker = start();
    history.pushState(null, "", "/about");
    tracker.track("signup");

    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends events when Do Not Track is off", () => {
    setBrowserValue(navigator, "doNotTrack", "0");
    start();
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

describe("setup", () => {
  it("does nothing without a site key, but track() is still safe to call", () => {
    const tracker = start(makeScript({}));
    expect(() => tracker.track("signup")).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
    expect(history.pushState).toBe(nativePushState);
  });

  it("does nothing without a script tag", () => {
    start(null);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("starts only once, even if the script is loaded twice", () => {
    start();
    start();
    history.pushState(null, "", "/about");
    expect(beacon).toHaveBeenCalledTimes(2); // 1 start + 1 navigation
  });

  it("uses no cookies and no browser storage", () => {
    const tracker = start();
    history.pushState(null, "", "/about");
    tracker.track("signup");

    expect(document.cookie).toBe("");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
