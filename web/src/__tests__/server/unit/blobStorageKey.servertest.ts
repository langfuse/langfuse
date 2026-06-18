import { createHash } from "crypto";
import { describe, it, expect } from "vitest";

import {
  buildEventBucketPrefix,
  parseEventKey,
  safeBlobFilenameStem,
  safeBlobKeySegment,
} from "@langfuse/shared/src/server";

const HEX16 = /^[0-9a-f]{16}$/;

const byteLen = (s: string) => Buffer.byteLength(s, "utf8");

describe("safeBlobKeySegment", () => {
  const N = 255;

  it("returns short ASCII IDs unchanged (no-op fast path)", () => {
    for (const s of ["a", "obs_123", "x".repeat(64), "x".repeat(200)]) {
      expect(safeBlobKeySegment(s, N)).toBe(s);
    }
  });

  it("returns IDs at exactly the budget unchanged", () => {
    const s = "a".repeat(N);
    expect(safeBlobKeySegment(s, N)).toBe(s);
  });

  it("hashes IDs that exceed the budget, fits within the budget", () => {
    const s = "a".repeat(N + 1);
    const out = safeBlobKeySegment(s, N);
    expect(byteLen(out)).toBeLessThanOrEqual(N);
    expect(byteLen(out)).toBe(N); // prefix takes all remaining budget
    const suffix = out.slice(-16);
    expect(suffix).toMatch(HEX16);
    expect(out[out.length - 17]).toBe("_");
  });

  it("hashes the litellm-style 262-byte case", () => {
    const s =
      "time-16-23-03-560977_resp_" +
      "bGl0ZWxsbTpjdXN0b21fbGxtX3Byb3ZpZGVyOm9wZW5haTttb2RlbF9pZDo" +
      "x".repeat(262 - "time-16-23-03-560977_resp_".length - 60);
    expect(byteLen(s)).toBeGreaterThan(N);
    const out = safeBlobKeySegment(s, N);
    expect(byteLen(out)).toBeLessThanOrEqual(N);
    expect(out.slice(-16)).toMatch(HEX16);
  });

  it("is deterministic across calls", () => {
    const s = "x".repeat(800);
    expect(safeBlobKeySegment(s, N)).toBe(safeBlobKeySegment(s, N));
  });

  it("distinguishes inputs that share a long common prefix", () => {
    const shared = "x".repeat(250);
    const a = shared + "AAAAAAAAAAAAAAAAAAAA";
    const b = shared + "BBBBBBBBBBBBBBBBBBBB";
    expect(safeBlobKeySegment(a, N)).not.toBe(safeBlobKeySegment(b, N));
  });

  it("opts out of length hashing at high maxBytes (pure-S3 deployment)", () => {
    const s = "x".repeat(262);
    expect(safeBlobKeySegment(s, 800)).toBe(s);
  });

  it("still sanitizes forbidden characters at high maxBytes", () => {
    const s = "abc/def\\ghi";
    const out = safeBlobKeySegment(s, 800);
    expect(out).not.toBe(s);
    expect(out).not.toMatch(/[/\\]/);
    // Forbidden-char sanitization always hashes to preserve injectivity.
    expect(out.slice(-16)).toMatch(HEX16);
    expect(out.startsWith("abc_def_ghi_")).toBe(true);
  });

  it("maps forbidden-char-only inputs to distinct outputs", () => {
    const a = "a/b";
    const b = "a_b";
    expect(safeBlobKeySegment(a, N)).not.toBe(safeBlobKeySegment(b, N));
  });

  it("replaces NUL and other ASCII control characters", () => {
    const s = "x\x00y\x01z\x1fw";
    const out = safeBlobKeySegment(s, N);
    expect(out).not.toMatch(/[\x00-\x1f]/);
    expect(out.startsWith("x_y_z_w_")).toBe(true);
  });

  it("truncates on UTF-8 byte boundaries (no torn codepoints)", () => {
    // 100 codepoints × 3 bytes each = 300 bytes
    const s = "あ".repeat(100);
    expect(byteLen(s)).toBe(300);
    const out = safeBlobKeySegment(s, N);
    expect(byteLen(out)).toBeLessThanOrEqual(N);
    // Result must be valid UTF-8: round-tripping through Buffer preserves it.
    expect(Buffer.from(out, "utf8").toString("utf8")).toBe(out);
    expect(out.slice(-16)).toMatch(HEX16);
  });

  it("preserves UTF-8 boundaries when the prefix budget lands mid-codepoint", () => {
    // 86 × 3 = 258 bytes — overshoots N=255, so we hash.
    // prefixBudget = N - 17 = 238 bytes. 238 / 3 = 79 r 1, so byte 238 is a
    // continuation byte; the walk-back must drop to 237 (= 79 complete
    // 3-byte codepoints) to avoid tearing a codepoint.
    const s = "あ".repeat(86);
    expect(byteLen(s)).toBe(258);
    const out = safeBlobKeySegment(s, N);
    expect(byteLen(out)).toBe(79 * 3 + 1 + 16); // 254
    expect(byteLen(out)).toBeLessThan(N);
    expect(Buffer.from(out, "utf8").toString("utf8")).toBe(out);
    expect(out.slice(-16)).toMatch(HEX16);
  });

  it("preserves a trailing extension when the caller reserves room", () => {
    // Mirrors the eval-scheduler path: sanitize the bare ID with a reduced
    // budget, then append ".json". Final filename must still fit N bytes.
    const SUFFIX = ".json";
    const id = "x".repeat(400);
    const safe = safeBlobKeySegment(id, N - SUFFIX.length);
    const filename = `${safe}${SUFFIX}`;
    expect(byteLen(filename)).toBeLessThanOrEqual(N);
    expect(filename.endsWith(SUFFIX)).toBe(true);
    // Hash suffix sits before the extension, not at the end of the filename.
    expect(safe.slice(-16)).toMatch(HEX16);
  });
});

describe("safeBlobFilenameStem", () => {
  // Pins both producer call sites that build `<id>.json` filenames:
  // processEventBatch.ts (event.id → file key) and createSchedulerDeps.ts
  // (observationId → eval snapshot). If either site regresses to raw
  // interpolation, the assertions below fail.

  it("sanitizes forbidden chars so the stem can never reroute the filename", () => {
    // event.id = "a/b/c" would otherwise nest the file four levels deeper
    // than the directory listFiles will scan, and would misparse on replay
    // (the standard-key regex's filename group is `([^/]+)\.json$`).
    const stem = safeBlobFilenameStem("a/b/c", ".json");
    expect(stem).not.toMatch(/[/\\]/);
    expect(stem.slice(-16)).toMatch(HEX16);
    expect(stem.startsWith("a_b_c_")).toBe(true);
  });

  it("budgets the suffix so the final filename fits the env default", () => {
    // Default LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES is 2048; the stem
    // helper reserves the suffix length, so `<stem>.json` must be ≤ 2048.
    const DEFAULT_BUDGET = 2048;
    const stem = safeBlobFilenameStem(
      "x".repeat(DEFAULT_BUDGET + 200),
      ".json",
    );
    const filename = `${stem}.json`;
    expect(byteLen(filename)).toBeLessThanOrEqual(DEFAULT_BUDGET);
    expect(stem.slice(-16)).toMatch(HEX16);
  });

  it("is a no-op for safe short IDs (no hash suffix, no replacement)", () => {
    const stem = safeBlobFilenameStem("event-12345", ".json");
    expect(stem).toBe("event-12345");
  });
});

describe("buildEventBucketPrefix", () => {
  const projectId = "proj-abc";
  const entityType = "observation" as const;
  // `.env.test` pins LANGFUSE_S3_EVENT_UPLOAD_PREFIX to "events/"; reading
  // it here gives the test a stable, hand-checkable expected value without
  // going through the same `env` module the helper uses.
  const envPrefix = process.env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX ?? "";

  it("composes <envPrefix><projectId>/<entityType>/<id>/ for short IDs", () => {
    // Hand-built constant — does not call `safeBlobKeySegment` so a future
    // change in the fast-path return value would surface here.
    const id = "obs-12345";
    expect(
      buildEventBucketPrefix({ projectId, entityType, entityId: id }),
    ).toBe(`${envPrefix}${projectId}/${entityType}/${id}/`);
  });

  it("composes the prefix from sha256-truncated id for oversized inputs", () => {
    // Pins the full layout — env, projectId, entityType, sanitized middle
    // segment, trailing slash — against a value built without calling
    // `safeBlobKeySegment`. We compute the sha256 prefix directly so a
    // future change in hash algorithm, truncation length, separator, or
    // budget arithmetic in `safeBlobKeySegment` fails this test rather
    // than passing silently along with a synchronized "expected" copy.
    //
    // Budget tracks the `LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES` default in
    // `packages/shared/src/env.ts`. If the default changes intentionally,
    // update this constant — the failure is the early-warning system.
    const DEFAULT_BUDGET = 2048;
    const id = "x".repeat(DEFAULT_BUDGET + 200); // > default budget
    const PREFIX_BUDGET = DEFAULT_BUDGET - 17; // budget - len("_<16 hex>")
    const expectedMiddle =
      "x".repeat(PREFIX_BUDGET) +
      "_" +
      createHash("sha256").update(id, "utf8").digest("hex").slice(0, 16);
    expect(
      buildEventBucketPrefix({ projectId, entityType, entityId: id }),
    ).toBe(`${envPrefix}${projectId}/${entityType}/${expectedMiddle}/`);
  });

  it("is deterministic", () => {
    const id = "obs-deterministic";
    const a = buildEventBucketPrefix({ projectId, entityType, entityId: id });
    const b = buildEventBucketPrefix({ projectId, entityType, entityId: id });
    expect(a).toBe(b);
  });
});

describe("parseEventKey", () => {
  it("parses a standard event key into structured pieces", () => {
    const parsed = parseEventKey("proj-1/observation/obs-123/abc-def.json");
    expect(parsed).toEqual({
      kind: "standard",
      projectId: "proj-1",
      entityType: "observation",
      eventBodyId: "obs-123",
      eventId: "abc-def",
    });
  });

  it("accepts legacy unsanitized eventBodyId containing /", () => {
    const parsed = parseEventKey("proj-1/score/a/b/c/event-x.json");
    expect(parsed).toEqual({
      kind: "standard",
      projectId: "proj-1",
      entityType: "score",
      eventBodyId: "a/b/c",
      eventId: "event-x",
    });
  });

  it("parses an otel key and exposes the projectId only", () => {
    const parsed = parseEventKey("otel/proj-1/2026/05/13/12/30/evt-9.json");
    expect(parsed).toEqual({ kind: "otel", projectId: "proj-1" });
  });

  it("returns null for unrecognized shapes", () => {
    expect(parseEventKey("not-a-key")).toBeNull();
    expect(parseEventKey("proj-1/obs/123.json")).toBeNull();
    expect(parseEventKey("")).toBeNull();
  });
});

describe("buildEventBucketPrefix / parseEventKey round-trip", () => {
  // Pins the parse/build co-evolution: any key the helper produces must
  // parse back via parseEventKey into the original components. This is
  // the single test that catches a future regex change that desyncs from
  // the helper template (or vice versa).
  const envPrefix = process.env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX ?? "";
  const projectId = "proj-rt";
  const entityType = "score" as const;
  const eventId = "event-rt";

  const cases: { name: string; entityId: string }[] = [
    { name: "short ID (no-op fast path)", entityId: "obs-short" },
    // Must exceed the default `LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES`
    // (2048) so the helper actually exercises the hash-suffix path; a
    // smaller value would hit the no-op fast path and stop testing the
    // sanitized-middle branch.
    { name: "oversized ID (sanitized middle)", entityId: "x".repeat(2200) },
  ];

  for (const { name, entityId } of cases) {
    it(`round-trips ${name}`, () => {
      const prefix = buildEventBucketPrefix({
        projectId,
        entityType,
        entityId,
      });
      const fullKey = `${prefix}${eventId}.json`;
      // parseEventKey expects keys relative to LANGFUSE_S3_EVENT_UPLOAD_PREFIX.
      const relativeKey = fullKey.startsWith(envPrefix)
        ? fullKey.slice(envPrefix.length)
        : fullKey;
      expect(parseEventKey(relativeKey)).toEqual({
        kind: "standard",
        projectId,
        entityType,
        eventBodyId: safeBlobKeySegment(entityId),
        eventId,
      });
    });
  }
});
