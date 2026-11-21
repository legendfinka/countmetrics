import type { InputHTMLAttributes } from "react";
import { Input } from "./input";
import { Label } from "./label";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/** A label, an input and its error message. */
export function Field({ id, label, error, hint, ...inputProps }: FieldProps) {
  const messageId = `${id}-message`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={messageId} className="mt-1.5 text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
