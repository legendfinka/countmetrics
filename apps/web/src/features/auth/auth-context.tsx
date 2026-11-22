import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  authResponseSchema,
  type AuthResponse,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from "@countmetrics/shared";
import { api, refreshSession, setAccessToken, setSessionLostHandler } from "../../lib/api";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: PublicUser };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // On page load, try to get a session from the refresh cookie
  useEffect(() => {
    let active = true;
    void refreshSession().then((session) => {
      if (active) setState(session ? { status: "authenticated", user: session.user } : { status: "anonymous" });
    });
    return () => {
      active = false;
    };
  }, []);

  // If a request finds out the session is gone, go back to the login page
  useEffect(() => {
    setSessionLostHandler(() => {
      queryClient.clear();
      setState({ status: "anonymous" });
    });
    return () => setSessionLostHandler(null);
  }, [queryClient]);

  const startSession = useCallback((session: AuthResponse) => {
    setAccessToken(session.accessToken);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      startSession(
        await api("/api/auth/login", { method: "POST", body: input, auth: false, schema: authResponseSchema }),
      );
    },
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      startSession(
        await api("/api/auth/register", { method: "POST", body: input, auth: false, schema: authResponseSchema }),
      );
    },
    [startSession],
  );

  const loginAsDemo = useCallback(async () => {
    startSession(
      await api("/api/auth/demo", { method: "POST", auth: false, schema: authResponseSchema }),
    );
  }, [startSession]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", auth: false });
    } catch {
      // Even if the server can't be reached, we still log out on this device
    }
    setAccessToken(null);
    queryClient.clear();
    setState({ status: "anonymous" });
  }, [queryClient]);

  const value = useMemo(
    () => ({ state, login, register, loginAsDemo, logout }),
    [state, login, register, loginAsDemo, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** For pages behind the login. The route guard makes sure there is a user. */
export function useUser(): { user: PublicUser; logout: () => Promise<void> } {
  const { state, logout } = useAuth();
  if (state.status !== "authenticated") throw new Error("useUser needs a logged-in user");
  return { user: state.user, logout };
}
