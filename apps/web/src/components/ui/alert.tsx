import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

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

/** An error message with a button to try again. */
export function ErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <Alert>{message}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function Loading({ children = "Loading…" }: { children?: string }) {
  return (
    <p role="status" className="animate-pulse py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
