import { cn } from "../../lib/utils";
import type { LiveStatus } from "./use-live-site";

const LOOKS: Record<LiveStatus, { text: string; dot: string }> = {
  live: { text: "Live", dot: "bg-good" },
  connecting: { text: "Connecting…", dot: "animate-pulse bg-muted/60" },
  reconnecting: { text: "Reconnecting…", dot: "animate-pulse bg-muted/60" },
  offline: { text: "Offline", dot: "bg-bad" },
};

/** A small badge that shows if the live connection works. */
export function LiveBadge({ status }: { status: LiveStatus }) {
  const { text, dot } = LOOKS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-semibold text-muted">
      <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
      {text}
    </span>
  );
}
