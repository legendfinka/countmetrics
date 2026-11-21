import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  LIVE_CLOSE,
  liveServerMessageSchema,
  type SiteUpdateMessage,
  type StatsOverview,
  type TimeseriesResponse,
} from "@countmetrics/shared";
import { WS_URL, getAccessToken, refreshSession } from "../../lib/api";
import { statsKey } from "../dashboard/stats-api";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";

/** Wait 1 s, then 2 s, 4 s ... but never more than 15 s. */
const backoff = (attempt: number): number => Math.min(1000 * 2 ** attempt, 15_000);

/**
 * Adds a live update to the numbers we already have, so the page changes at once.
 * Unique visitors can't be added up from small updates. They come with the next refresh.
 */
function applyUpdate(queryClient: QueryClient, siteId: string, update: SiteUpdateMessage): void {
  queryClient.setQueriesData<StatsOverview>(
    { queryKey: statsKey(siteId, "overview") },
    (old) =>
      old && {
        ...old,
        pageviews: old.pageviews + update.pageviews,
        events: old.events + update.events,
        currentVisitors: update.currentVisitors,
      },
  );

  queryClient.setQueriesData<TimeseriesResponse>(
    { queryKey: statsKey(siteId, "timeseries") },
    (old) => {
      const last = old?.points.at(-1);
      if (!old || !last) return old;
      const points = [...old.points.slice(0, -1), { ...last, pageviews: last.pageviews + update.pageviews }];
      return { ...old, points };
    },
  );
}

/**
 * Keeps a WebSocket open for the site and merges its updates into the query cache.
 * It logs in with the first message, and reconnects if the connection drops.
 */
export function useLiveSite(
  siteId: string,
  retryDelay: (attempt: number) => number = backoff,
): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    setStatus("connecting");

    async function reconnect(closeCode: number): Promise<void> {
      if (closeCode === LIVE_CLOSE.SITE_NOT_FOUND) {
        setStatus("offline");
        return;
      }
      // The token expired. Get a new one first. If that fails, the user is logged out.
      if (closeCode === LIVE_CLOSE.UNAUTHORIZED && !(await refreshSession())) {
        setStatus("offline");
        return;
      }
      if (stopped) return;
      retryTimer = setTimeout(connect, retryDelay(attempt++));
    }

    function connect(): void {
      const current = new WebSocket(`${WS_URL}/api/sites/${siteId}/live`);
      socket = current;

      current.onopen = () => current.send(JSON.stringify({ type: "auth", token: getAccessToken() }));

      current.onmessage = (event) => {
        let message;
        try {
          message = liveServerMessageSchema.safeParse(JSON.parse(String(event.data)));
        } catch {
          return;
        }
        if (!message.success) return;

        if (message.data.type === "ready") {
          attempt = 0;
          setStatus("live");
        } else {
          applyUpdate(queryClient, siteId, message.data);
        }
      };

      current.onclose = (event) => {
        if (stopped) return;
        setStatus("reconnecting");
        void reconnect(event.code);
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [queryClient, siteId, retryDelay]);

  return status;
}
