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
        // 16px text on phones, because iPhones zoom into smaller inputs
        "w-full rounded border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted/70 sm:text-sm",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand",
        invalid ? "border-bad" : "border-line",
        className,
      )}
      {...props}
    />
  );
}
