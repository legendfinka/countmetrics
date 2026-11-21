import { Globe, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Site } from "@countmetrics/shared";
import { Alert, Loading } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { errorMessage } from "../../lib/api";
import { SiteForm } from "./site-form";
import { useDeleteSite, useSites } from "./sites-api";

function SiteRow({ site }: { site: Site }) {
  const deleteSite = useDeleteSite();

  function onDelete() {
    if (!window.confirm(`Delete ${site.domain}? All its data will be lost.`)) return;
    deleteSite.mutate(site.id);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Globe size={20} className="shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{site.domain}</p>
          <p className="text-sm text-muted">Added {new Date(site.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          to={`/sites/${site.id}`}
          className="rounded border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Open
        </Link>
        <Button
          variant="danger"
          onClick={onDelete}
          disabled={deleteSite.isPending}
          aria-label={`Delete ${site.domain}`}
          className="px-3 py-2"
        >
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

export function SitesPage() {
  const navigate = useNavigate();
  const sites = useSites();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your sites</h1>

      <SiteForm onCreated={(siteId) => navigate(`/sites/${siteId}`)} />

      <Card>
        {sites.isPending && <Loading />}

        {sites.isError && (
          <div className="space-y-3">
            <Alert>{errorMessage(sites.error)}</Alert>
            <Button variant="secondary" onClick={() => void sites.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {sites.isSuccess && sites.data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            No sites yet. Add your first website above.
          </p>
        )}

        {sites.isSuccess && sites.data.length > 0 && (
          <ul className="divide-y divide-line">
            {sites.data.map((site) => (
              <SiteRow key={site.id} site={site} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
