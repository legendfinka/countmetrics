// Runs the API and the worker together, so both fit in one free server.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const apps = ["api", "worker"].map((name) =>
  spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL(`../apps/${name}`, import.meta.url)),
    stdio: "inherit",
  }),
);

let stopping = false;
let exitCode = 0;
let running = apps.length;

function stop() {
  stopping = true;
  for (const app of apps) app.kill("SIGTERM");
}

for (const app of apps) {
  app.on("exit", (code) => {
    // If one app stops by itself, stop the other too. The host then restarts both.
    if (!stopping) {
      exitCode = code || 1;
      stop();
    }
    // Wait for both, so the worker can save its last batch
    if (--running === 0) process.exit(exitCode);
  });
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
