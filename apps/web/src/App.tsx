import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout";
import { LoginPage } from "./features/auth/login-page";
import { RegisterPage } from "./features/auth/register-page";
import { GuestRoute, ProtectedRoute } from "./features/auth/route-guards";
import { SitePage } from "./features/sites/site-page";
import { SitesPage } from "./features/sites/sites-page";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/:id" element={<SitePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/sites" replace />} />
    </Routes>
  );
}
