import { Link } from "react-router-dom";
import { loginSchema } from "@countmetrics/shared";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { AuthPage } from "./auth-page";
import { useAuth } from "./auth-context";
import { useAuthForm } from "./use-auth-form";

export function LoginPage() {
  const { login } = useAuth();
  const form = useAuthForm({ email: "", password: "" }, loginSchema, login);

  return (
    <AuthPage
      title="Log in"
      footer={
        <>
          No account yet?{" "}
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={form.onSubmit} noValidate className="space-y-4">
        {form.formError && <Alert>{form.formError}</Alert>}
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          value={form.values.email}
          onChange={form.onChange}
          error={form.errors.email}
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          value={form.values.password}
          onChange={form.onChange}
          error={form.errors.password}
        />
        <Button type="submit" className="w-full" disabled={form.busy}>
          {form.busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthPage>
  );
}
