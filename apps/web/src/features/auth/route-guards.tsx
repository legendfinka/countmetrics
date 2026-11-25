import { Navigate, Outlet } from "react-router-dom";
import { DEMO_SITE_ID, DEMO_USER_ID } from "@countmetrics/shared";
import { Splash } from "../../components/splash";
import { useAuth } from "./auth-context";

/** Pages for logged-in users. Everyone else goes to the login page. */
export function ProtectedRoute() {
  const { state } = useAuth();

  if (state.status === "loading") return <Splash />;
  if (state.status === "anonymous") return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Login and register pages. Logged-in users go to their start page. */
export function GuestRoute() {
  const { state } = useAuth();

  if (state.status === "loading") return <Splash />;
  if (state.status === "authenticated") {
    // The demo user starts on the demo dashboard. Everybody else on the list of sites.
    const home = state.user.id === DEMO_USER_ID ? `/sites/${DEMO_SITE_ID}` : "/sites";
    return <Navigate to={home} replace />;
  }
  return <Outlet />;
}
