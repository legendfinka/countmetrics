import type { StatsRange } from "@countmetrics/shared";
import { cn } from "../../lib/utils";

const OPTIONS: { value: StatsRange; label: string }[] = [
  { value: "30m", label: "30 min" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

interface RangeSwitchProps {
  value: StatsRange;
  onChange: (range: StatsRange) => void;
}

/** Four buttons to pick the time range. */
export function RangeSwitch({ value, onChange }: RangeSwitchProps) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex overflow-hidden rounded border border-line bg-white">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "border-r border-line px-3 py-2 text-sm font-semibold last:border-r-0",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
            option.value === value ? "bg-brand text-white" : "text-ink hover:bg-page",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
