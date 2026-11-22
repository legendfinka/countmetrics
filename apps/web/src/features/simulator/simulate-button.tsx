import { Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { errorMessage } from "../../lib/api";
import { useSimulationStatus, useStartSimulation } from "./simulator-api";

/**
 * Counts down on the screen. It counts from the moment the server answered,
 * so a wrong clock on the computer can't break it.
 */
function useSecondsLeft(secondsLeft: number, since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, since]);

  return Math.max(0, secondsLeft - Math.floor(Math.max(0, now - since) / 1000));
}

/** Starts fake traffic for the site. Shows a countdown while it runs, and during the pause after it. */
export function SimulateButton({ siteId }: { siteId: string }) {
  const status = useSimulationStatus(siteId);
  const start = useStartSimulation(siteId);

  const state = status.data?.state ?? "idle";
  const secondsLeft = status.data?.secondsLeft ?? 0;
  const remaining = useSecondsLeft(secondsLeft, status.dataUpdatedAt, state !== "idle");

  // When the countdown is over, ask the server again. It may have moved on to the next state.
  const { refetch, dataUpdatedAt } = status;
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => void refetch(), secondsLeft * 1000 + 500);
    return () => clearTimeout(timer);
  }, [state, secondsLeft, dataUpdatedAt, refetch]);

  let label = "Simulate traffic";
  if (start.isPending) label = "Starting…";
  else if (state === "running") label = `Simulating… ${remaining}s`;
  else if (state === "cooldown") label = `Available in ${remaining}s`;

  return (
    <div>
      <Button onClick={() => start.mutate()} disabled={state !== "idle" || start.isPending}>
        {state === "running" ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Play size={16} aria-hidden="true" />
        )}
        {label}
      </Button>
      {start.isError && (
        <p role="alert" className="mt-1.5 text-xs text-bad">
          {errorMessage(start.error)}
        </p>
      )}
    </div>
  );
}
