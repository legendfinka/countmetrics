import type { StatsOverview } from "@countmetrics/shared";
import { Card } from "../../components/ui/card";
import { formatNumber } from "./format";

const STATS: { label: string; hint: string; value: (overview: StatsOverview) => number }[] = [
  { label: "Pageviews", hint: "In this period", value: (o) => o.pageviews },
  { label: "Visitors", hint: "Unique, counted per day", value: (o) => o.visitors },
  { label: "Custom events", hint: "In this period", value: (o) => o.events },
];

/** The four big numbers on top. "—" is shown until the first data arrives. */
export function StatCards({ overview }: { overview?: StatsOverview }) {
  const show = (value?: number) => (value === undefined ? "—" : formatNumber(value));

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card role="region" aria-label="Online now">
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-good" />
          Online now
        </p>
        <p className="mt-1 text-3xl font-semibold">{show(overview?.currentVisitors)}</p>
        <p className="text-xs text-muted">Last 5 minutes</p>
      </Card>

      {STATS.map((stat) => (
        <Card key={stat.label} role="region" aria-label={stat.label}>
          <p className="text-sm text-muted">{stat.label}</p>
          <p className="mt-1 text-3xl font-semibold">{show(overview && stat.value(overview))}</p>
          <p className="text-xs text-muted">{stat.hint}</p>
        </Card>
      ))}
    </div>
  );
}
