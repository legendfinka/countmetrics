import type { ZodType, ZodTypeDef } from "zod";
import { authResponseSchema, type AuthResponse } from "@countmetrics/shared";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
/** The same server for WebSockets: http becomes ws, https becomes wss. */
export const WS_URL = API_URL.replace(/^http/, "ws");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// The access token lives only in memory. A page reload gets a new one from the refresh cookie.
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when the session can't be renewed. The app then shows the login page. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

let refreshing: Promise<AuthResponse | null> | null = null;

/**
 * Gets a new access token with the refresh cookie.
 * Parallel calls share one request. The API treats a reused refresh token as theft
 * and logs the user out everywhere, so we must never send two at once.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= requestRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function requestRefresh(): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const session = authResponseSchema.parse(await res.json());
    accessToken = session.accessToken;
    return session;
  } catch {
    // Network problem or broken response
    accessToken = null;
    return null;
  }
}

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Checks the response. Without it, the JSON is used as it is. */
  schema?: ZodType<T, ZodTypeDef, unknown>;
  /** false for login and register. They have no token and must not trigger a refresh. */
  auth?: boolean;
}

function send(path: string, { method = "GET", body, auth = true }: RequestOptions<unknown>) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as { error: { code: string; message: string; details?: unknown } };
    return new ApiError(res.status, error.code, error.message, error.details);
  } catch {
    return new ApiError(res.status, "UNKNOWN_ERROR", "Something went wrong. Please try again.");
  }
}

/** Calls the API. On a 401 it renews the token once and tries again. */
export async function api<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const tokenUsed = accessToken;
  let res = await send(path, options);

  if (res.status === 401 && options.auth !== false) {
    // Another request may have renewed the token while this one was running
    const alreadyRenewed = accessToken !== null && accessToken !== tokenUsed;
    if (alreadyRenewed || (await refreshSession())) {
      res = await send(path, options);
    } else {
      onSessionLost?.();
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;

  const json: unknown = await res.json();
  return options.schema ? options.schema.parse(json) : (json as T);
}

/** A short message for the user. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Could not reach the server. Check your connection and try again.";
}
