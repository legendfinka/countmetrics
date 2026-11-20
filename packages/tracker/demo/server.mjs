import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const PORT = 4000;
const read = (path) => readFile(new URL(path, import.meta.url));

// Serves the built tracker and the demo page (for every other path)
createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  try {
    if (path === "/tracker.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(await read("../dist/tracker.js"));
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(await read("./index.html"));
    }
  } catch {
    res.writeHead(500);
    res.end("Build the tracker first: pnpm --filter @countmetrics/tracker build");
  }
}).listen(PORT, () => {
  console.log(`Demo page: http://localhost:${PORT}/?key=YOUR_SITE_KEY`);
});
