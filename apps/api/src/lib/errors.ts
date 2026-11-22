/** An expected error for the client. The error handler turns it into a response. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (code = "UNAUTHORIZED", message = "Authentication required") =>
  new AppError(401, code, message);

export const notFound = (code: string, message: string) => new AppError(404, code, message);

export const forbidden = (code: string, message: string) => new AppError(403, code, message);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export const tooManyRequests = (retryAfterSeconds: number) =>
  new AppError(429, "RATE_LIMITED", "Too many requests", undefined, {
    "retry-after": String(retryAfterSeconds),
  });
