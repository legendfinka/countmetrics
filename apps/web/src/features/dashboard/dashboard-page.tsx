import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { statsRangeSchema, type BreakdownKind, type StatsRange } from "@countmetrics/shared";
import { Alert, Loading } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardTitle } from "../../components/ui/card";
import { ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/utils";
import { LiveBadge } from "../live/live-badge";
import { useLiveSite } from "../live/use-live-site";
import { SimulateButton } from "../simulator/simulate-button";
import { Snippet } from "../sites/snippet";
import { useSite } from "../sites/sites-api";
import { BreakdownCard } from "./breakdown-card";
import { capitalize, countryLabel } from "./format";
import { RangeSwitch } from "./range-switch";
import { StatCards } from "./stat-cards";
import { useOverview } from "./stats-api";
import { TimeseriesCard } from "./timeseries-card";

const LISTS: { kind: BreakdownKind; title: string; label?: (name: string) => string }[] = [
  { kind: "pages", title: "Top pages" },
  { kind: "referrers", title: "Top referrers" },
  { kind: "countries", title: "Countries", label: countryLabel },
  { kind: "devices", title: "Devices", label: capitalize },
  { kind: "browsers", title: "Browsers" },
  { kind: "actions", title: "Top events" },
];

function TrackerCard({ siteKey, open, onToggle }: { siteKey: string; open: boolean; onToggle: () => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="mb-0">Tracker snippet</CardTitle>
        <Button variant="secondary" aria-expanded={open} onClick={onToggle}>
          {open ? "Hide snippet" : "Show snippet"}
        </Button>
      </div>
      {open && (
        <div className="mt-4">
          <p className="mb-4 text-sm text-muted">
            Copy this line and paste it into the <code>&lt;head&gt;</code> of every page you want to
            measure.
          </p>
          <Snippet siteKey={siteKey} />
        </div>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  // The range is in the URL, so a link shows the same view. A wrong value becomes 24h.
  const range = statsRangeSchema.catch("24h").parse(params.get("range"));

  const site = useSite(id);
  const liveStatus = useLiveSite(id);
  const overview = useOverview(id, range);
  // undefined = the user did not choose yet. Then the snippet is open only for an empty site.
  const [snippetChoice, setSnippetChoice] = useState<boolean>();

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

  const empty = overview.isSuccess && overview.data.pageviews + overview.data.events === 0;
  const snippetOpen = snippetChoice ?? empty;
  const tracker = (
    <TrackerCard
      siteKey={site.data.siteKey}
      open={snippetOpen}
      onToggle={() => setSnippetChoice(!snippetOpen)}
    />
  );

  const changeRange = (next: StatsRange) => setParams({ range: next }, { replace: true });

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/sites"
          className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          All sites
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{site.data.domain}</h1>
            <LiveBadge status={liveStatus} />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <SimulateButton siteId={id} />
            <RangeSwitch value={range} onChange={changeRange} />
          </div>
        </div>
      </div>

      {/* A site without data needs the snippet first */}
      {empty && tracker}

      {/* The old numbers stay visible (a little faded) while a new range loads */}
      <div className={cn("space-y-6 transition-opacity", overview.isPlaceholderData && "opacity-60")}>
        <StatCards overview={overview.data} />
        <TimeseriesCard siteId={id} range={range} />
        <div className="grid gap-6 md:grid-cols-2">
          {LISTS.map((list) => (
            <BreakdownCard key={list.kind} siteId={id} range={range} {...list} />
          ))}
        </div>
      </div>

      {!empty && tracker}
    </div>
  );
}
