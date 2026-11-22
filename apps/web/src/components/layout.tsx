import { BarChart3, LogOut } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { DEMO_USER_ID } from "@countmetrics/shared";
import { useUser } from "../features/auth/auth-context";

/** The page frame for logged-in users: a dark top bar and the page below it. */
export function Layout() {
  const { user, logout } = useUser();

  return (
    <div className="min-h-screen">
      <header className="bg-bar text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/sites" className="flex items-center gap-2 text-lg font-bold">
            <BarChart3 size={22} aria-hidden="true" />
            CountMetrics
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-white/70 sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      </header>
      {user.id === DEMO_USER_ID && (
        <div className="bg-brand/10 text-sm">
          <p className="mx-auto max-w-4xl px-4 py-2">
            You are using the <strong>demo account</strong>. It is read-only. Click{" "}
            <strong>Simulate traffic</strong> to watch the dashboard come alive.
          </p>
        </div>
      )}
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
