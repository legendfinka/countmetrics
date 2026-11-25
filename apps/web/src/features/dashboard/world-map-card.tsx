import { lazy, Suspense } from "react";
import type { StatsRange } from "@countmetrics/shared";
import { ErrorWithRetry, Loading } from "../../components/ui/alert";
import { Card, CardTitle } from "../../components/ui/card";
import { errorMessage } from "../../lib/api";
import { useBreakdown } from "./stats-api";

const WorldMap = lazy(async () => ({ default: (await import("./world-map")).WorldMap }));

/** There are fewer countries than this, so the map gets all of them. */
const ALL_COUNTRIES = 250;

export function WorldMapCard({ siteId, range }: { siteId: string; range: StatsRange }) {
  const query = useBreakdown(siteId, "countries", range, ALL_COUNTRIES);

  return (
    <Card role="region" aria-label="World map">
      <CardTitle className="text-base">World map</CardTitle>

      {query.isPending && <Loading />}

      {query.isError && !query.data && (
        <ErrorWithRetry message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      )}

      {query.data && (
        <Suspense fallback={<Loading />}>
          <WorldMap rows={query.data.rows} />
        </Suspense>
      )}
    </Card>
  );
}
