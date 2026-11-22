import { useState } from "react";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { errorMessage } from "../../lib/api";
import { useAuth } from "./auth-context";

/** Opens the demo account. No sign-up is needed. */
export function TryDemoButton() {
  const { loginAsDemo } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      await loginAsDemo();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void onClick()}>
        {busy ? "Opening the demo…" : "Try the demo"}
      </Button>
    </div>
  );
}
