import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "danger" | "destructive";

const variants: Record<Variant, string> = {
  primary: "border-brand bg-brand text-white hover:bg-brand-dark hover:border-brand-dark",
  secondary: "border-line bg-surface text-ink hover:bg-page",
  danger: "border-line bg-surface text-bad hover:bg-bad/10",
  /** The final "yes, delete" button */
  destructive: "border-bad bg-bad text-white hover:opacity-90",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded border px-4 py-2.5 text-sm font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
