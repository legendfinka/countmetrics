import type { ReactNode } from "react";
import { Footer } from "../../components/footer";
import { Logo } from "../../components/logo";
import { ThemeToggle } from "../../components/theme-toggle";
import { Card } from "../../components/ui/card";
import { TryDemoButton } from "./try-demo-button";

interface AuthPageProps {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

/** The frame of the login and register pages: logo, a card, and a link below. */
export function AuthPage({ title, children, footer }: AuthPageProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <ThemeToggle className="absolute right-3 top-3 text-muted hover:bg-line focus-visible:outline-brand" />
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo size={72} className="mb-3 drop-shadow-md" />
        <p className="text-3xl font-bold text-ink">CountMetrics</p>
        <p className="mt-1 text-muted">Live web analytics that respects privacy</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-xs font-semibold text-ink">
          {["No cookies", "Real-time", "No stored IPs"].map((feature) => (
            <li key={feature} className="rounded-full bg-brand/10 px-3 py-1">
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-5 text-xl font-semibold">{title}</h1>
        {children}
        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
          or
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>
        <TryDemoButton />
      </Card>
      <p className="mt-5 text-sm text-muted">{footer}</p>
      <Footer />
    </div>
  );
}
