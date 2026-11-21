import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  breakdownSchema,
  overviewSchema,
  timeseriesSchema,
  type BreakdownKind,
  type StatsRange,
} from "@countmetrics/shared";
import { api } from "../../lib/api";

/** Numbers that are not live (unique visitors, lists) are fetched again this often. */
const REFRESH_MS = 30_000;

/** Query keys start with ["stats", siteId, kind], so the live updates can find them. */
export const statsKey = (siteId: string, kind: string, ...rest: (string | number)[]) =>
  ["stats", siteId, kind, ...rest] as const;

// While a new range loads, the old numbers stay on screen instead of flashing empty

export const useOverview = (siteId: string, range: StatsRange) =>
  useQuery({
    queryKey: statsKey(siteId, "overview", range),
    queryFn: () => api(`/api/sites/${siteId}/stats/overview?range=${range}`, { schema: overviewSchema }),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });

export const useTimeseries = (siteId: string, range: StatsRange) =>
  useQuery({
    queryKey: statsKey(siteId, "timeseries", range),
    queryFn: () => api(`/api/sites/${siteId}/stats/timeseries?range=${range}`, { schema: timeseriesSchema }),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });

export const useBreakdown = (siteId: string, kind: BreakdownKind, range: StatsRange) =>
  useQuery({
    queryKey: statsKey(siteId, kind, range),
    queryFn: () =>
      api(`/api/sites/${siteId}/stats/${kind}?range=${range}&limit=10`, { schema: breakdownSchema }),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
