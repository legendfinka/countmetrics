import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../../../test/helpers.js";

describe("GET /tracker.js", () => {
  let dir: string;
  let withFile: TestContext;
  let withoutFile: TestContext;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "tracker-"));
    const file = join(dir, "tracker.js");
    await writeFile(file, "console.log('tracker');");
    withFile = await createTestContext({}, { trackerFile: file });
    withoutFile = await createTestContext({}, { trackerFile: join(dir, "missing.js") });
  });
  afterAll(async () => {
    await withFile.close();
    await withoutFile.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("serves the script without a login", async () => {
    const res = await withFile.app.inject({ method: "GET", url: "/tracker.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/javascript");
    expect(res.headers["cache-control"]).toContain("max-age");
    expect(res.body).toBe("console.log('tracker');");
  });

  it("returns 404 when the tracker is not built", async () => {
    const res = await withoutFile.app.inject({ method: "GET", url: "/tracker.js" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("TRACKER_NOT_BUILT");
  });
});
