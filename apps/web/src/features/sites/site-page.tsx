import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Alert, Loading } from "../../components/ui/alert";
import { Card, CardTitle } from "../../components/ui/card";
import { ApiError, errorMessage } from "../../lib/api";
import { Snippet } from "./snippet";
import { useSite, useSiteActivity } from "./sites-api";

/** Tells the user if the tracker already sent something. */
function ActivityStatus({ siteId }: { siteId: string }) {
  const activity = useSiteActivity(siteId);
  const receiving = activity.isSuccess && activity.data.pageviews + activity.data.events > 0;

  return (
    <p role="status" className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className={receiving ? "size-2.5 rounded-full bg-good" : "size-2.5 animate-pulse rounded-full bg-muted/60"}
      />
      {receiving ? (
        <span className="font-semibold text-good">Receiving data</span>
      ) : (
        <span className="text-muted">Waiting for your first pageview…</span>
      )}
    </p>
  );
}

export function SitePage() {
  const { id = "" } = useParams();
  const site = useSite(id);

  if (site.isPending) return <Loading />;

  if (site.isError) {
    const missing = site.error instanceof ApiError && (site.error.status === 404 || site.error.status === 400);
    return (
      <div className="space-y-4">
        <Alert>{missing ? "We could not find this site." : errorMessage(site.error)}</Alert>
        <Link to="/sites" className="text-sm font-semibold text-brand hover:underline">
          Back to your sites
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/sites" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          <ArrowLeft size={16} aria-hidden="true" />
          All sites
        </Link>
        <h1 className="text-2xl font-semibold">{site.data.domain}</h1>
      </div>

      <Card>
        <CardTitle>Install the tracker</CardTitle>
        <p className="mb-4 text-sm text-muted">
          Copy this line and paste it into the <code>&lt;head&gt;</code> of every page you want to
          measure.
        </p>
        <Snippet siteKey={site.data.siteKey} />
      </Card>

      <Card>
        <CardTitle>Status</CardTitle>
        <ActivityStatus siteId={site.data.id} />
      </Card>
    </div>
  );
}
