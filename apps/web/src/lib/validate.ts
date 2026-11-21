import type { ZodType, ZodTypeDef } from "zod";

export type FieldErrors = Record<string, string>;

/** Checks values with a shared Zod schema. Returns the data, or one message per field. */
export function validate<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  values: unknown,
): { data: T } | { errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    errors[issue.path.join(".")] ??= issue.message;
  }
  return { errors };
}
