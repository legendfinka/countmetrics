import { lazy, Suspense } from "react";
import type { StatsRange } from "@countmetrics/shared";
import { ErrorWithRetry, Loading } from "../../components/ui/alert";
import { Card, CardTitle } from "../../components/ui/card";
import { errorMessage } from "../../lib/api";
import { useTimeseries } from "./stats-api";

// The chart library is big, so it is only loaded when there is something to draw
const TimeseriesChart = lazy(() =>
  import("./timeseries-chart").then((module) => ({ default: module.TimeseriesChart })),
);

export function TimeseriesCard({ siteId, range }: { siteId: string; range: StatsRange }) {
  const query = useTimeseries(siteId, range);
  const points = query.data?.points ?? [];
  const hasData = points.some((point) => point.pageviews > 0 || point.visitors > 0);

  return (
    <Card role="region" aria-label="Pageviews and visitors over time">
      <CardTitle>Pageviews and visitors</CardTitle>

      {query.isPending && <Loading />}

      {query.isError && !query.data && (
        <ErrorWithRetry message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      )}

      {query.data && !hasData && (
        <p className="py-10 text-center text-sm text-muted">No pageviews in this period yet.</p>
      )}

      {query.data && hasData && (
        <Suspense fallback={<Loading />}>
          <div role="img" aria-label="Chart of pageviews and visitors over time">
            <TimeseriesChart points={points} range={range} />
          </div>
        </Suspense>
      )}
    </Card>
  );
}
