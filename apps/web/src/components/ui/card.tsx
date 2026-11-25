import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // min-w-0 lets long text be cut off inside a grid, instead of widening the page on phones
      className={cn("min-w-0 rounded border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(44,62,80,0.06)]", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("mb-3 text-lg font-semibold text-ink", className)} {...props} />;
}
