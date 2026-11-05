import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { extractNextApiRoute } from "@/src/features/otel/nextApiRouteSpanName";

const requireFromHere = createRequire(import.meta.url);

describe("extractNextApiRoute", () => {
  it("extracts the Pages Router route template", () => {
    expect(
      extractNextApiRoute(
        "executing api route (pages) /api/public/traces/[traceId]",
      ),
    ).toBe("/api/public/traces/[traceId]");
  });

  it("extracts the App Router route template", () => {
    expect(extractNextApiRoute("executing api route (app) /api/foo/[id]")).toBe(
      "/api/foo/[id]",
    );
  });

  it("returns undefined for non route-handler span names", () => {
    expect(extractNextApiRoute("GET")).toBeUndefined();
    expect(extractNextApiRoute("resolve page components")).toBeUndefined();
    expect(extractNextApiRoute("")).toBeUndefined();
  });
});

describe("Next route-handler span name contract", () => {
  // Pins the "executing api route (…) <route>" prefix against the installed
  // Next; a version bump that renames the span fails here, not silently in prod.
  it("Pages Router still names the span 'executing api route (pages) <route>'", () => {
    const source = readFileSync(
      requireFromHere.resolve("next/dist/server/api-utils/index.js"),
      "utf8",
    );
    expect(source).toContain("executing api route (pages) ");
  });

  it("App Router still names the span 'executing api route (app) <route>'", () => {
    const source = readFileSync(
      requireFromHere.resolve(
        "next/dist/server/route-modules/app-route/module.js",
      ),
      "utf8",
    );
    expect(source).toContain("executing api route (app) ");
  });
});
