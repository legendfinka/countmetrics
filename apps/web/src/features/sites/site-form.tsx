import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createSiteSchema } from "@countmetrics/shared";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardTitle } from "../../components/ui/card";
import { Field } from "../../components/ui/field";
import { errorMessage } from "../../lib/api";
import { validate } from "../../lib/validate";
import { useCreateSite } from "./sites-api";

/** Adds a website. After it is saved, `onCreated` gets the new site id. */
export function SiteForm({ onCreated }: { onCreated: (siteId: string) => void }) {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string>();
  const createSite = useCreateSite();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(createSiteSchema, { domain });
    if ("errors" in result) {
      setError(result.errors.domain);
      return;
    }

    setError(undefined);
    createSite.mutate(result.data.domain, { onSuccess: (site) => onCreated(site.id) });
  }

  return (
    <Card>
      <CardTitle>Add a website</CardTitle>
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        {createSite.isError && <Alert>{errorMessage(createSite.error)}</Alert>}
        <Field
          id="domain"
          name="domain"
          label="Domain"
          placeholder="example.com"
          hint="You can paste a full address. We keep only the domain."
          autoComplete="off"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          error={error}
        />
        <Button type="submit" disabled={createSite.isPending}>
          <Plus size={16} aria-hidden="true" />
          {createSite.isPending ? "Adding…" : "Add site"}
        </Button>
      </form>
    </Card>
  );
}
