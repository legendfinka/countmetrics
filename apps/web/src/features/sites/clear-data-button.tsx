import { Trash2 } from "lucide-react";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { errorMessage } from "../../lib/api";
import { useClearSiteData } from "./sites-api";

/** Deletes all visits of a site, after the user confirms. */
export function ClearDataButton({ siteId, domain }: { siteId: string; domain: string }) {
  const clear = useClearSiteData(siteId);

  function onClick() {
    const question = `Delete all visits and stats of ${domain}? This can't be undone.`;
    if (window.confirm(question)) clear.mutate();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {clear.isError && <Alert>{errorMessage(clear.error)}</Alert>}
      <Button variant="danger" onClick={onClick} disabled={clear.isPending}>
        <Trash2 size={16} aria-hidden="true" />
        {clear.isPending ? "Clearing…" : "Clear data"}
      </Button>
    </div>
  );
}
