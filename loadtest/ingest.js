// Load test for POST /api/event. See RESULTS.md for how to run it.
import { check } from "k6";
import http from "k6/http";

const API_URL = __ENV.API_URL || "http://localhost:3000";
// The demo site. Run the seed first. Run it again to remove the test events.
const SITE_KEY = __ENV.SITE_KEY || "cm_demositekey1";
const RATE = Number(__ENV.RATE || 500);
const DURATION = __ENV.DURATION || "60s";

export const options = {
  scenarios: {
    ingest: {
      // Sends a fixed number of requests per second, even if the API gets slow
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 1000,
    },
  },
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const PATHS = ["/", "/", "/", "/pricing", "/blog", "/docs", "/signup", "/about"];
const REFERRERS = ["", "", "https://google.com/", "https://github.com/", "https://x.com/"];
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// One event per request, like the real tracker
export default function () {
  const custom = Math.random() < 0.05;
  const body = JSON.stringify({
    siteKey: SITE_KEY,
    type: custom ? "signup" : "pageview",
    path: pick(PATHS),
    referrer: pick(REFERRERS),
  });
  const res = http.post(`${API_URL}/api/event`, body, {
    headers: {
      "content-type": "application/json",
      // A different text per virtual user, so there are many unique visitors
      "user-agent": `${pick(USER_AGENTS)} k6/${__VU}`,
    },
  });
  check(res, { "status is 202": (r) => r.status === 202 });
}
