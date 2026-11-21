import { useState, type ChangeEvent, type FormEvent } from "react";
import type { ZodType, ZodTypeDef } from "zod";
import { ApiError, errorMessage } from "../../lib/api";
import { validate, type FieldErrors } from "../../lib/validate";

/**
 * Form state for the login and register pages:
 * checks the values with the shared schema, sends them, and shows errors.
 * `serverFields` says which field an API error code belongs to (like EMAIL_TAKEN -> email).
 */
export function useAuthForm<Values extends Record<string, string>, Data>(
  initial: Values,
  schema: ZodType<Data, ZodTypeDef, unknown>,
  submit: (data: Data) => Promise<void>,
  serverFields: Record<string, keyof Values & string> = {},
) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = validate(schema, values);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await submit(result.data);
    } catch (err) {
      const field = err instanceof ApiError ? serverFields[err.code] : undefined;
      if (field) setErrors({ [field]: errorMessage(err) });
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return { values, errors, formError, busy, onChange, onSubmit };
}
