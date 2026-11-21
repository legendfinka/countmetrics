import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** A calm red box for errors. Screen readers read it out. */
export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alert"
      className={cn("rounded border border-bad/40 bg-bad/10 px-3 py-2.5 text-sm text-ink", className)}
      {...props}
    />
  );
}

export function Loading({ children = "Loading…" }: { children?: string }) {
  return (
    <p role="status" className="animate-pulse py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
