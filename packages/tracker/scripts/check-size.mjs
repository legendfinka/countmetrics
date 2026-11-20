import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT_BYTES = 2048;
const file = new URL("../dist/tracker.js", import.meta.url);

if (!existsSync(file)) {
  console.error("dist/tracker.js not found. Run the build first.");
  process.exit(1);
}

const size = gzipSync(readFileSync(file), { level: 9 }).length;
console.log(`tracker.js: ${size} bytes gzipped (limit ${LIMIT_BYTES})`);

if (size > LIMIT_BYTES) {
  console.error("The tracker is too big.");
  process.exit(1);
}
