import { useState, type PointerEvent } from "react";
import type { BreakdownRow } from "@countmetrics/shared";
import { countryLabel, formatNumber } from "./format";
import { MAP_VIEW_BOX, WORLD_SHAPES } from "./world-shapes";

/**
 * How strong the colour is, from 0.25 to 1. The square root keeps small countries visible
 * when one country has far more visits than the others.
 */
const strength = (count: number, biggest: number) => 0.25 + 0.75 * Math.sqrt(count / biggest);

const pageviews = (count: number) =>
  count === 0 ? "No visits" : `${formatNumber(count)} ${count === 1 ? "pageview" : "pageviews"}`;

interface Hover {
  code: string;
  d: string;
  /** Where the pointer is inside the map, in pixels */
  x: number;
  y: number;
  /** The width of the map, in pixels */
  width: number;
}

/** The map. It is loaded on demand, because the shapes are big. */
export function WorldMap({ rows }: { rows: BreakdownRow[] }) {
  const [hover, setHover] = useState<Hover | null>(null);
  // "Unknown" is not on the map, so it must not change the colour scale
  const counts = new Map(
    rows.filter((row) => row.name !== "Unknown").map((row) => [row.name, row.count]),
  );
  const biggest = Math.max(1, ...counts.values());

  function show(event: PointerEvent<SVGPathElement>, code: string, d: string) {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    setHover({ code, d, x: event.clientX - box.left, y: event.clientY - box.top, width: box.width });
  }

  // A share from 0 to 1. The tooltip moves by the same share, so it never leaves the map.
  const across = hover && hover.width > 0 ? Math.min(1, Math.max(0, hover.x / hover.width)) : 0;
  // Near the top there is no room above the pointer
  const below = hover !== null && hover.y < 60;

  return (
    <div
      className="relative"
      // A finger "leaves" as soon as it is lifted, so after a tap the tooltip stays
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setHover(null);
      }}
    >
      {/* The country list has the same numbers as text, for screen readers */}
      <svg viewBox={MAP_VIEW_BOX} role="img" aria-label="World map of pageviews by country" className="w-full">
        {/* The sea. Pointing at it hides the tooltip. */}
        <rect width="100%" height="100%" fill="transparent" onPointerEnter={() => setHover(null)} />

        {WORLD_SHAPES.map((shape, index) => {
          const { code, d } = shape;
          const count = code ? counts.get(code) : undefined;
          return (
            <path
              key={code ?? index}
              d={d}
              fill={count ? "var(--color-brand)" : "var(--color-line)"}
              fillOpacity={count ? strength(count, biggest) : 1}
              stroke="var(--color-surface)"
              strokeWidth={0.5}
              onPointerMove={code ? (event) => show(event, code, d) : undefined}
              onPointerDown={code ? (event) => show(event, code, d) : undefined}
            />
          );
        })}

        {/* Drawn last, so the neighbours don't cover the highlighted border */}
        {hover && (
          <path
            data-testid="map-highlight"
            d={hover.d}
            fill="var(--color-ink)"
            fillOpacity={0.12}
            stroke="var(--color-ink)"
            strokeWidth={1.2}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
      </svg>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-line bg-surface px-3 py-1.5 text-sm shadow-lg"
          style={{
            left: hover.x,
            top: hover.y,
            transform: `translate(${-across * 100}%, ${below ? "18px" : "calc(-100% - 12px)"})`,
          }}
        >
          <p className="font-semibold">{countryLabel(hover.code)}</p>
          <p className="text-muted">{pageviews(counts.get(hover.code) ?? 0)}</p>
        </div>
      )}
    </div>
  );
}
