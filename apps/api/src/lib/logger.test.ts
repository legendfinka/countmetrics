import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loggerOptions } from "./logger.js";

describe("logger", () => {
  it("never writes the visitor's IP", async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: { ...loggerOptions, stream: { write: (line: string) => void lines.push(line) } },
    });
    app.get("/ping", async () => "ok");

    await app.inject({ url: "/ping", remoteAddress: "203.0.113.7" });
    await app.close();

    const output = lines.join("");
    expect(output).toContain("/ping");
    expect(output).not.toContain("203.0.113.7");
  });
});
