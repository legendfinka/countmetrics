import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded border bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted/70",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand",
        invalid ? "border-bad" : "border-line",
        className,
      )}
      {...props}
    />
  );
}
