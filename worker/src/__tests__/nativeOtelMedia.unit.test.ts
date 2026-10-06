import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { validateOtelJson } from "@langfuse/native";
import { MediaContentType } from "@langfuse/shared";
import { mediaPayloadCases } from "../../../packages/shared/src/server/media/MediaPayloadProcessor.fixtures";
import { getMediaId } from "../../../packages/shared/src/server/media/mediaService";
import { processOtelMedia } from "../../../packages/shared/src/server/otel/OtelMediaProcessor";

vi.mock("../../../packages/shared/src/server/instrumentation", () => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

type MediaBody = { contentType: string; bytes: Buffer };

// Compare occurrences as a multiset: TS handles Data URIs before provider objects
// in stringified JSON, while Rust visits their source order. The compact payload
// separately verifies that every replacement occupies the right field.
function sortedBodies(bodies: MediaBody[]): MediaBody[] {
  return bodies.sort(
    (a, b) =>
      a.contentType.localeCompare(b.contentType) ||
      Buffer.compare(a.bytes, b.bytes),
  );
}

async function expectMediaParity(json: string): Promise<void> {
  const payload = { input: JSON.parse(json) as unknown };
  const expectedBodies: MediaBody[] = [];
  // Use the production TS detector and decoder; only the external upload is
  // replaced. This branch never sees the native result.
  await processOtelMedia({
    targets: [{ traceId: "trace", observationId: "span", payload }],
    projectId: "native-media-contract",
    writePath: "direct",
    mediaBucket: "test",
    mediaPrefix: "test/",
    uploadMedia: async ({ contentType, contentBytes }) => {
      expectedBodies.push({ contentType, bytes: contentBytes });
      return {
        mediaId: getMediaId(
          createHash("sha256").update(contentBytes).digest("base64"),
        ),
        outcome: "uploaded",
      };
    },
  });

  const validated = await validateOtelJson(Buffer.from(json));
  try {
    const batch = await validated.extract(true);
    try {
      // Assert at the NAPI boundary. Running the late TS detector here could
      // repair a missed extraction and let a broken native implementation pass.
      const compact = batch.json();
      expect(JSON.parse(compact)).toEqual(payload.input);
      if (batch.media.length === 0) expect(compact).toBe(json);
      const actualBodies: MediaBody[] = [];
      for (const media of batch.media) {
        const bytes = await batch.mediaBody(media.index);
        expect(media.sha256Hash).toBe(
          createHash("sha256").update(bytes).digest("base64"),
        );
        actualBodies.push({ contentType: media.contentType, bytes });
      }
      expect(sortedBodies(actualBodies)).toEqual(sortedBodies(expectedBodies));
    } finally {
      await batch.dispose();
    }
  } finally {
    await validated.dispose();
  }
}

describe(
  "native media matches the TypeScript payload contract",
  { retry: 0 },
  () => {
    it.each(mediaPayloadCases)("$name", ({ json }) => expectMediaParity(json));

    it.each([
      '{"type":"file","mediaType":"image/png","data":"YWJj","data":"ZGVm"}',
      '{"type":"other","type":"file","mediaType":"text/plain","mediaType":"image/png","data":"ZGVm"}',
      '{"inline_data":{"mime_type":"image/png","data":"YWJj"},"inline_data":{"mime_type":"image/png","data":"YWJj","data":"ZGVm"}}',
      '{"inline_data":{"mime_type":"image/png","mimeType":"text/plain","data":"ZGVm"}}',
      '{"inline_data":{"mime_type":null,"mimeType":"image/png","data":"ZGVm"}}',
      '{"inlineData":{"mime_type":null,"mimeType":"image/png","data":"ZGVm"}}',
      '{"type":1,"payload":{"type":"file","mediaType":42,"input":"data:image/png;base64,aGk="}}',
      '{"type":"file","mediaType":42,"data":"aGk="}',
      '{"type":"file","mediaType":"image/png","data":42,"image":"aGk="}',
      '{"type":"file","mediaType":"image/png","data":"YWJj","image":"aGk="}',
      JSON.stringify({ type: "file", mediaType: "image/png", data: "b''" }),
      JSON.stringify("data:image/png;name=a\u00a0b;base64,aGk="),
      JSON.stringify({
        type: "file",
        mediaType: "image/png",
        data: "b'abc\\'",
      }),
    ])("preserves raw provider field semantics: %s", expectMediaParity);

    it.each(["data:malformed@", "data:broken ", "data:bad,", "data:"])(
      "finds a valid URI after %s",
      (prefix) =>
        expectMediaParity(
          JSON.stringify(`${prefix}data:image/png;base64,aGk=`),
        ),
    );

    it("matches Node decoding at Base64 length and padding boundaries", async () => {
      for (let length = 0; length <= 20; length++) {
        for (let padding = 0; padding <= 3; padding++) {
          const data = "A".repeat(length) + "=".repeat(padding);
          await expectMediaParity(
            JSON.stringify([
              `data:image/png;base64,${data}`,
              { type: "file", mediaType: "image/png", data },
            ]),
          );
        }
      }
    });

    it("compares generated media spellings without canonicalizing raw JSON", async () => {
      const encoded = fc
        .array(
          fc.constantFrom(
            ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
          ),
          {
            minLength: 1,
            maxLength: 48,
          },
        )
        .map((parts) => parts.join(""));
      await fc.assert(
        fc.asyncProperty(
          encoded,
          fc.integer({ min: 0, max: 3 }),
          fc.constantFrom("", "data:malformed@", "data:broken "),
          async (body, padding, prefix) => {
            const data = body + "=".repeat(padding);
            // Keep repeated keys in the source. Building a JS object first would
            // erase the last-value-wins behavior this boundary needs to preserve.
            await expectMediaParity(
              `[{"type":"file","mediaType":"text/plain","mediaType":"image/png","data":"aGk=","data":${JSON.stringify(data)}},${JSON.stringify(`${prefix}data:image/png;base64,${data}`)}]`,
            );
          },
        ),
        { numRuns: 256 },
      );
    });

    it.each(["deep objects", "many tiny media"] as const)(
      "extracts %s entirely through the native API",
      async (shape) => {
        const uri = "data:image/png;base64,aGk=";
        const count = shape === "deep objects" ? 32 : 16_385;
        let value = JSON.stringify(uri);
        if (shape === "deep objects") {
          for (let depth = 0; depth < 120; depth++) value = `{"x":${value}}`;
        }
        const source = `[${Array.from({ length: count }, () => value).join(",")}]`;
        const validated = await validateOtelJson(Buffer.from(source));
        const batch = await validated.extract(true);
        try {
          const media = batch.media;
          expect(media).toHaveLength(count);
          expect(batch.json()).not.toContain(uri);
          expect(batch.json().match(/@@@langfuseMedia:/g)).toHaveLength(count);
          for (const index of [0, count - 1]) {
            expect((await batch.mediaBody(index)).toString()).toBe("hi");
            expect(await batch.originalMedia(index)).toBe(uri);
          }
        } finally {
          await batch.dispose();
          await validated.dispose();
        }
      },
    );

    it("reports embedded unsupported surrogates to the TS fallback", async () => {
      const embedded = JSON.stringify({
        type: "file",
        mediaType: "image/png",
        data: "aGk=",
        note: "\ud800",
      });
      const input = JSON.stringify({ input: embedded });

      await expect(validateOtelJson(Buffer.from(input))).rejects.toMatchObject({
        code: "ERR_OTEL_UNSUPPORTED",
      });
    });

    it.each([
      [
        "embedded media ambiguity",
        JSON.stringify({
          input: JSON.stringify([
            { type: "file", mediaType: "image/png", data: "YQ==" },
            { type: "file", mediaType: "image/png", data: "b'a'" },
          ]),
        }),
      ],
      [
        "embedded unsupported surrogate",
        JSON.stringify({
          input: JSON.stringify({
            type: "file",
            mediaType: "image/png",
            data: "YQ==",
            note: "\ud800",
          }),
        }),
      ],
    ] as const)(
      "validates %s without media discovery",
      async (_name, input) => {
        const validated = await validateOtelJson(Buffer.from(input), false);
        const batch = await validated.extract(false);
        try {
          expect(batch.media).toHaveLength(0);
          expect(batch.json()).toBe(input);
        } finally {
          await batch.dispose();
          await validated.dispose();
        }
      },
    );
  },
);

it(
  "extracts every MIME type supported by the TypeScript media service",
  { retry: 0 },
  async () => {
    const contentTypes = Object.values(MediaContentType);
    const validated = await validateOtelJson(
      Buffer.from(
        JSON.stringify(contentTypes.map((type) => `data:${type};base64,aGk=`)),
      ),
    );
    const batch = await validated.extract(true);
    try {
      expect(batch.media.map((media) => media.contentType)).toEqual(
        contentTypes,
      );
      expect(JSON.parse(batch.json())).toEqual(
        batch.media.map((media) => media.reference),
      );
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
  },
);

it(
  "owns input snapshots and in-flight media reads across handle disposal",
  { retry: 0 },
  async () => {
    const uri = "data:image/png;base64,aGk=";
    const source = Buffer.from(JSON.stringify({ input: uri }));
    const validation = validateOtelJson(source);
    source.fill(0); // JS retains a mutable Buffer; the async validator must own its snapshot.
    const validated = await validation;
    const pendingExtraction = validated.extract(true);
    await validated.dispose();
    const batch = await pendingExtraction;
    try {
      await expect(validated.extract(true)).rejects.toMatchObject({
        code: "ERR_OTEL_CLOSED",
      });
      const [media] = batch.media;
      expect(JSON.parse(batch.json())).toEqual({ input: media.reference });
      expect(media.sha256Hash).toBe(
        createHash("sha256").update("hi").digest("base64"),
      );
      await expect(batch.mediaBody(1)).rejects.toThrow("unknown media index");

      const body = batch.mediaBody(media.index);
      const original = batch.originalMedia(media.index);
      await batch.dispose();
      await expect(body).resolves.toEqual(Buffer.from("hi"));
      await expect(original).resolves.toBe(uri);
      expect(() => batch.json()).toThrow("already disposed");
      await expect(batch.mediaBody(0)).rejects.toMatchObject({
        code: "ERR_OTEL_CLOSED",
      });
      await expect(batch.originalMedia(0)).rejects.toMatchObject({
        code: "ERR_OTEL_CLOSED",
      });
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
  },
);
