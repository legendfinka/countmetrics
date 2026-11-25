import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { errorMessage } from "../../lib/api";
import { useClearSiteData } from "./sites-api";

/** Deletes all visits of a site, after the user confirms. */
export function ClearDataButton({ siteId, domain }: { siteId: string; domain: string }) {
  const clear = useClearSiteData(siteId);
  const [asking, setAsking] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {clear.isError && <Alert>{errorMessage(clear.error)}</Alert>}
      <Button variant="danger" onClick={() => setAsking(true)} disabled={clear.isPending}>
        <Trash2 size={16} aria-hidden="true" />
        {clear.isPending ? "Clearing…" : "Clear data"}
      </Button>
      {asking && (
        <ConfirmDialog
          title="Clear all data?"
          message={`All visits and stats of ${domain} will be deleted. This can't be undone.`}
          confirmLabel="Yes, clear it"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            clear.mutate();
          }}
        />
      )}
    </div>
  );
}
