import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { API_URL } from "../../lib/api";

/** The script tag the customer pastes into their website. */
export const snippetFor = (siteKey: string): string =>
  `<script defer src="${API_URL}/tracker.js" data-site-key="${siteKey}"></script>`;

export function Snippet({ siteKey }: { siteKey: string }) {
  const code = snippetFor(siteKey);
  const [copied, setCopied] = useState(false);

  // Show "Copied" for 2 seconds
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // The browser blocked the clipboard. The user can still select the text.
    }
  }

  return (
    <div className="space-y-3">
      <pre className="overflow-x-auto rounded border border-line bg-page p-3 text-sm text-ink">
        <code>{code}</code>
      </pre>
      <Button variant="secondary" onClick={() => void copy()}>
        {copied ? <Check size={16} className="text-good" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
