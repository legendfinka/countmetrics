import { describe, expect, it } from "vitest";
import { lookupCountry, normalizePath, normalizeReferrer, parseUserAgent } from "./enrich.js";

describe("parseUserAgent", () => {
  it.each([
    [
      "Chrome on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "desktop",
      "Chrome",
    ],
    [
      "Edge on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      "desktop",
      "Edge",
    ],
    [
      "Firefox on Linux",
      "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
      "desktop",
      "Firefox",
    ],
    [
      "Safari on macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "desktop",
      "Safari",
    ],
    [
      "Safari on iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "mobile",
      "Safari",
    ],
    [
      "Chrome on Android phone",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "mobile",
      "Chrome",
    ],
    [
      "Chrome on Android tablet",
      "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "tablet",
      "Chrome",
    ],
    [
      "Safari on iPad",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "tablet",
      "Safari",
    ],
    ["empty user agent", "", "desktop", "Other"],
  ])("%s", (_name, ua, device, browser) => {
    expect(parseUserAgent(ua)).toEqual({ device, browser });
  });
});

describe("normalizePath", () => {
  it.each([
    ["/pricing", "/pricing"],
    ["/search?q=secret", "/search"],
    ["/page#section", "/page"],
    ["/a?b=1#c", "/a"],
    ["no-leading-slash", "/no-leading-slash"],
    ["?only=query", "/"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it("caps the length at 512", () => {
    expect(normalizePath(`/${"a".repeat(1000)}`)).toHaveLength(512);
  });
});

describe("normalizeReferrer", () => {
  it.each([
    ["https://www.google.com/search?q=x", "google.com"],
    ["http://News.Example.org/story/1", "news.example.org"],
    ["https://t.co/abc", "t.co"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeReferrer(input)).toBe(expected);
  });

  it.each([undefined, "", "not a url", "javascript:alert(1)", "android-app://com.google"])(
    "%j -> null",
    (input) => {
      expect(normalizeReferrer(input)).toBeNull();
    },
  );
});

describe("lookupCountry (real geoip database)", () => {
  it("resolves a public IP", () => {
    expect(lookupCountry("8.8.8.8")).toBe("US");
  });

  it("returns null for private, invalid and empty addresses", () => {
    expect(lookupCountry("192.168.1.1")).toBeNull();
    expect(lookupCountry("not-an-ip")).toBeNull();
    expect(lookupCountry("")).toBeNull();
  });
});
