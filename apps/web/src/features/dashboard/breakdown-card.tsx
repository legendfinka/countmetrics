import type { BreakdownKind, StatsRange } from "@countmetrics/shared";
import { ErrorWithRetry, Loading } from "../../components/ui/alert";
import { Card, CardTitle } from "../../components/ui/card";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/utils";
import { formatNumber } from "./format";
import { useBreakdown } from "./stats-api";

interface BreakdownCardProps {
  siteId: string;
  kind: BreakdownKind;
  title: string;
  range: StatsRange;
  /** Turns a name from the API into text for the screen (like "DE" into "Germany") */
  label?: (name: string) => string;
}

/** The same width in the header and the rows, so the numbers line up */
const NUMBER_COLUMN = "w-14 shrink-0 text-right";

/** A top list. Each row has a bar that shows its share of the biggest row. */
export function BreakdownCard({ siteId, kind, title, range, label = (name) => name }: BreakdownCardProps) {
  const query = useBreakdown(siteId, kind, range);
  const rows = query.data?.rows ?? [];
  const biggest = Math.max(1, ...rows.map((row) => row.count));

  return (
    <Card role="region" aria-label={title}>
      <CardTitle className="text-base">{title}</CardTitle>

      {query.isPending && <Loading />}

      {query.isError && !query.data && (
        <ErrorWithRetry message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      )}

      {query.data && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No data yet</p>
      )}

      {rows.length > 0 && (
        <>
          {/* Both numbers are always visible, so nobody has to hover. That also works on phones. */}
          <div aria-hidden="true" className="mb-1.5 flex justify-end gap-3 px-2 text-xs text-muted">
            <span className={NUMBER_COLUMN}>Visitors</span>
            <span className={NUMBER_COLUMN}>{kind === "actions" ? "Count" : "Views"}</span>
          </div>
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li
                key={row.name}
                className="relative flex items-center gap-3 rounded px-2 py-1.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded bg-brand/10"
                  style={{ width: `${(row.count / biggest) * 100}%` }}
                />
                <span className="relative min-w-0 flex-1 truncate">{label(row.name)}</span>
                <span className={cn("relative text-muted", NUMBER_COLUMN)}>
                  {formatNumber(row.visitors)}
                  {/* Screen readers don't see the column names, so they get them here */}
                  <span className="sr-only"> visitors</span>
                </span>
                <span className={cn("relative font-semibold", NUMBER_COLUMN)}>
                  {formatNumber(row.count)}
                  <span className="sr-only">{kind === "actions" ? " times" : " views"}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
