import { describe, expect, it } from "vitest";
import { capitalize, countryLabel, formatNumber, formatTick, formatTooltip } from "./format";

describe("formatNumber", () => {
  it("adds thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("chart labels", () => {
  const time = "2026-03-10T00:05:00Z";

  it("shows only the time for short ranges (and midnight is 00:00)", () => {
    expect(formatTick(time, "30m", "UTC")).toBe("00:05");
    expect(formatTick("2026-03-10T14:30:00Z", "24h", "UTC")).toBe("14:30");
  });

  it("shows the day and time for 7 days", () => {
    expect(formatTick("2026-03-10T14:30:00Z", "7d", "UTC")).toBe("Mar 10, 14:30");
  });

  it("shows only the day for 30 days", () => {
    expect(formatTick("2026-03-10T14:30:00Z", "30d", "UTC")).toBe("Mar 10");
  });

  it("puts the date into the tooltip, except for 30 days", () => {
    expect(formatTooltip("2026-03-10T14:30:00Z", "24h", "UTC")).toBe("Mar 10, 14:30");
    expect(formatTooltip("2026-03-10T14:30:00Z", "30d", "UTC")).toBe("Mar 10");
  });
});

describe("countryLabel", () => {
  it("adds a flag and the country name", () => {
    expect(countryLabel("DE")).toBe("🇩🇪 Germany");
    expect(countryLabel("US")).toBe("🇺🇸 United States");
  });

  it("keeps other values as they are", () => {
    expect(countryLabel("Unknown")).toBe("Unknown");
    expect(countryLabel("de")).toBe("de");
  });
});

describe("capitalize", () => {
  it("makes the first letter big", () => {
    expect(capitalize("mobile")).toBe("Mobile");
    expect(capitalize("")).toBe("");
  });
});
