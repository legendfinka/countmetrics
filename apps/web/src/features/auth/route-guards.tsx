import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DEMO_SITE_ID, DEMO_USER_ID } from "@countmetrics/shared";
import { Loading } from "../../components/ui/alert";
import { useAuth } from "./auth-context";

/** Pages for logged-in users. Everyone else goes to the login page. */
export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <Loading />;
  if (state.status === "anonymous") return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Login and register pages. Logged-in users go to the page they wanted, or to the sites. */
export function GuestRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <Loading />;
  if (state.status === "authenticated") {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    // The demo user lands on the demo dashboard. Everybody else on the list of sites.
    const home = state.user.id === DEMO_USER_ID ? `/sites/${DEMO_SITE_ID}` : "/sites";
    return <Navigate to={from ?? home} replace />;
  }
  return <Outlet />;
}
