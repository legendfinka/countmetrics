import { readFile } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import { notFound } from "../../lib/errors.js";

/** Serves the built tracker script, so customers can use <script src=".../tracker.js">. */
export function trackerRoutes({ file }: { file: string }): FastifyPluginAsync {
  // The file is read once and kept in memory
  let script: string | undefined;

  return async (app) => {
    app.get("/tracker.js", async (_request, reply) => {
      try {
        script ??= await readFile(file, "utf8");
      } catch {
        throw notFound("TRACKER_NOT_BUILT", "Tracker is not built. Run the tracker build first.");
      }
      return reply
        .header("content-type", "text/javascript; charset=utf-8")
        .header("cache-control", "public, max-age=300")
        .send(script);
    });
  };
}
