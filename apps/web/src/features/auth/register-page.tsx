import { Link } from "react-router-dom";
import { registerSchema } from "@countmetrics/shared";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { AuthPage } from "./auth-page";
import { useAuth } from "./auth-context";
import { useAuthForm } from "./use-auth-form";

export function RegisterPage() {
  const { register } = useAuth();
  const form = useAuthForm({ name: "", email: "", password: "" }, registerSchema, register, {
    EMAIL_TAKEN: "email",
  });

  return (
    <AuthPage
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={form.onSubmit} noValidate className="space-y-4">
        {form.formError && <Alert>{form.formError}</Alert>}
        <Field
          id="name"
          name="name"
          label="Name"
          autoComplete="name"
          value={form.values.name}
          onChange={form.onChange}
          error={form.errors.name}
        />
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
          autoComplete="new-password"
          hint="At least 8 characters."
          value={form.values.password}
          onChange={form.onChange}
          error={form.errors.password}
        />
        <Button type="submit" className="w-full" disabled={form.busy}>
          {form.busy ? "Creating account…" : "Sign up"}
        </Button>
      </form>
    </AuthPage>
  );
}
