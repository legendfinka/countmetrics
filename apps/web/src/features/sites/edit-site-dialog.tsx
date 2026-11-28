import { useId, useState, type FormEvent } from "react";
import { updateSiteSchema, type Site } from "@countmetrics/shared";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field } from "../../components/ui/field";
import { errorMessage } from "../../lib/api";
import { validate } from "../../lib/validate";
import { useUpdateSite } from "./sites-api";

/** Changes the domain of a site. It stays open until the change is saved or cancelled. */
export function EditSiteDialog({ site, onClose }: { site: Site; onClose: () => void }) {
  const [domain, setDomain] = useState(site.domain);
  const [error, setError] = useState<string>();
  const updateSite = useUpdateSite(site.id);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  // While saving, the popup can't close. Otherwise the change would happen unseen.
  const close = () => {
    if (!updateSite.isPending) onClose();
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(updateSiteSchema, { domain });
    if ("errors" in result) {
      setError(result.errors.domain);
      return;
    }

    setError(undefined);
    if (result.data.domain === site.domain) onClose();
    else updateSite.mutate(result.data.domain, { onSuccess: onClose });
  }

  return (
    <Dialog titleId={titleId} descriptionId={descriptionId} onCancel={close}>
      <h2 id={titleId} className="text-lg font-semibold">
        Edit site
      </h2>
      <p id={descriptionId} className="mt-2 text-sm text-muted">
        This only changes the name here. Your snippet and stats stay the same.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-3">
        {updateSite.isError && <Alert>{errorMessage(updateSite.error)}</Alert>}
        <Field
          id={inputId}
          name="domain"
          label="New domain"
          autoComplete="off"
          value={domain}
          onChange={(event) => {
            setDomain(event.target.value);
            // The old server error was about the old value
            if (updateSite.isError) updateSite.reset();
          }}
          error={error}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={updateSite.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateSite.isPending}>
            {updateSite.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
