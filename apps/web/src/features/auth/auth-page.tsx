import { BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
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
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-2xl font-bold text-bar">
        <BarChart3 size={28} className="text-brand" aria-hidden="true" />
        CountMetrics
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
    </div>
  );
}
