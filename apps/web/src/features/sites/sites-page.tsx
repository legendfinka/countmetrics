import { Globe, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Site } from "@countmetrics/shared";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Logo } from "../../components/logo";
import { Alert, Loading } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { errorMessage } from "../../lib/api";
import { EditSiteDialog } from "./edit-site-dialog";
import { SiteForm } from "./site-form";
import { useDeleteSite, useSites } from "./sites-api";

function SiteRow({ site }: { site: Site }) {
  const deleteSite = useDeleteSite();
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <li className="py-1">
      <div className="relative -mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-page">
        {/* The link's ::after covers the whole row, so a click anywhere opens the site */}
        <Link
          to={`/sites/${site.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0 after:rounded focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
        >
          <Globe size={20} className="shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{site.domain}</span>
            <span className="block text-sm text-muted">
              Added {new Date(site.createdAt).toLocaleDateString()}
            </span>
          </span>
        </Link>
        {/* "relative" puts the buttons above the link, so they don't open the site */}
        <div className="relative flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setEditing(true)}
            disabled={deleteSite.isPending}
            aria-label={`Edit ${site.domain}`}
            className="px-3 py-2"
          >
            <Pencil size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="danger"
            onClick={() => setAsking(true)}
            disabled={deleteSite.isPending}
            aria-label={`Delete ${site.domain}`}
            className="px-3 py-2"
          >
            <Trash2 size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {editing && <EditSiteDialog site={site} onClose={() => setEditing(false)} />}
      {deleteSite.isError && <Alert>{errorMessage(deleteSite.error)}</Alert>}
      {asking && (
        <ConfirmDialog
          title="Delete site?"
          message={`${site.domain} and all its data will be deleted. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            deleteSite.mutate(site.id);
          }}
        />
      )}
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
          <div className="flex flex-col items-center gap-3 py-6">
            <Logo size={48} />
            <p className="text-center text-sm text-muted">
              No sites yet. Add your first website above.
            </p>
          </div>
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
