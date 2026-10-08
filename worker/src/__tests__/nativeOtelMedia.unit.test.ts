import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { validateOtelJson } from "@langfuse/native";
import { MediaContentType } from "@langfuse/shared";
import {
  mediaPayloadCases,
  PNG_BASE64,
  TEXT_BASE64,
} from "../../../packages/shared/src/server/media/MediaPayloadProcessor.fixtures";
import { getMediaId } from "../../../packages/shared/src/server/media/mediaService";
import { processOtelMedia } from "../../../packages/shared/src/server/otel/OtelMediaProcessor";

vi.mock("../../../packages/shared/src/server/instrumentation", () => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

type MediaBody = { contentType: string; bytes: Buffer };

const MEDIA_BODY = Buffer.from("hi".repeat(2048));
const MEDIA_BASE64 = MEDIA_BODY.toString("base64");
const MEDIA_URI = `data:image/png;base64,${MEDIA_BASE64}`;

// These shared fixtures use tiny bodies. Enlarge their literal contents without
// parsing their JSON: duplicate keys and escape spelling are part of the test.
function extractionSizedFixture(json: string): string {
  for (const encoded of [PNG_BASE64, TEXT_BASE64, "YWJj", "ZGVm", "aGk="]) {
    json = json.replaceAll(encoded, "A".repeat(4096) + encoded);
  }
  return json.replace(/b'(?=[^'])/g, `b'${"a".repeat(4096)}`);
}

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

/**
 * Native extraction keeps an occurrence-specific pending id until the upload
 * adapter runs. Compare the resulting document with the TypeScript detector's
 * public id without teaching this boundary test about the pending-id format.
 */
function canonicalizeNativeReferences(
  value: unknown,
  media: ReadonlyArray<{ reference: string; sha256Hash: string }>,
): unknown {
  if (typeof value === "string") {
    return media.reduce(
      (result, entry) =>
        result
          .split(entry.reference)
          .join(
            entry.reference.replace(
              /\|id=[^|@]+/,
              `|id=${getMediaId(entry.sha256Hash)}`,
            ),
          ),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeNativeReferences(item, media));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        canonicalizeNativeReferences(item, media),
      ]),
    );
  }
  return value;
}

async function expectMediaParity(json: string): Promise<void> {
  json = extractionSizedFixture(json);
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
      expect(
        canonicalizeNativeReferences(JSON.parse(compact), batch.media),
      ).toEqual(payload.input);
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

    it("extracts media from SDK JSON-string-wrapped OTLP metadata", async () => {
      const providerBody = Buffer.from("provider attachment ".repeat(256));
      const uriMetadata = JSON.stringify({ image: MEDIA_URI });
      const rawUriMetadata = MEDIA_URI;
      const providerMetadata = JSON.stringify({
        type: "file",
        mediaType: "image/png",
        data: providerBody.toString("base64"),
      });
      const input = JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    attributes: [
                      {
                        key: "metadata.attachment",
                        value: { stringValue: JSON.stringify(uriMetadata) },
                      },
                      {
                        key: "metadata.raw-attachment",
                        value: { stringValue: JSON.stringify(rawUriMetadata) },
                      },
                      {
                        key: "metadata.provider",
                        value: { stringValue: JSON.stringify(providerMetadata) },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const validated = await validateOtelJson(Buffer.from(input));
      const batch = await validated.extract(true);
      try {
        expect(batch.media).toHaveLength(3);
        expect(batch.media.map((media) => media.contentType)).toEqual([
          "image/png",
          "image/png",
          "image/png",
        ]);
        await expect(batch.mediaBody(0)).resolves.toEqual(MEDIA_BODY);
        await expect(batch.mediaBody(1)).resolves.toEqual(MEDIA_BODY);
        await expect(batch.mediaBody(2)).resolves.toEqual(providerBody);

        const compact = JSON.parse(batch.json()) as {
          resourceSpans: Array<{
            scopeSpans: Array<{
              spans: Array<{
                attributes: Array<{ value: { stringValue: string } }>;
              }>;
            }>;
          }>;
        };
        const attributes = compact.resourceSpans[0]!.scopeSpans[0]!.spans[0]!
          .attributes;
        expect(JSON.parse(JSON.parse(attributes[0]!.value.stringValue))).toEqual({
          image: batch.media[0]!.reference,
        });
        expect(JSON.parse(attributes[1]!.value.stringValue)).toBe(
          batch.media[1]!.reference,
        );
        expect(
          JSON.parse(JSON.parse(attributes[2]!.value.stringValue)),
        ).toMatchObject({ data: batch.media[2]!.reference });
        await expect(
          batch.originalMedia(0, batch.media[0]!.originalJsonDepth),
        ).resolves.toBe(MEDIA_URI);
        await expect(
          batch.originalMedia(1, batch.media[1]!.originalJsonDepth),
        ).resolves.toBe(MEDIA_URI);
        await expect(
          batch.originalMedia(2, batch.media[2]!.originalJsonDepth),
        ).resolves.toBe(providerBody.toString("base64"));
      } finally {
        await batch.dispose();
        await validated.dispose();
      }
    });

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
          const data = "A".repeat(4096 + length) + "=".repeat(padding);
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
            const data = "A".repeat(4096) + body + "=".repeat(padding);
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
      "handles %s entirely through the native API",
      async (shape) => {
        const uri =
          shape === "deep objects" ? MEDIA_URI : "data:image/png;base64,aGk=";
        const count = shape === "deep objects" ? 32 : 16_385;
        let value = JSON.stringify(uri);
        if (shape === "deep objects") {
          for (let depth = 0; depth < 200; depth++) value = `{"x":${value}}`;
        }
        const source = `[${Array.from({ length: count }, () => value).join(",")}]`;
        const validated = await validateOtelJson(Buffer.from(source));
        const batch = await validated.extract(true);
        try {
          const media = batch.media;
          if (shape === "many tiny media") {
            expect(media).toHaveLength(0);
            expect(batch.json()).toBe(source);
            return;
          }
          expect(media).toHaveLength(count);
          expect(batch.json()).not.toContain(uri);
          expect(batch.json().match(/@@@langfuseMedia:/g)).toHaveLength(count);
          for (const index of [0, count - 1]) {
            expect(await batch.mediaBody(index)).toEqual(MEDIA_BODY);
            expect(await batch.originalMedia(index)).toBe(uri);
          }
        } finally {
          await batch.dispose();
          await validated.dispose();
        }
      },
    );

    it("sanitizes malformed UTF-8 before recording media offsets", async () => {
      for (const sequence of [
        [0xff],
        [0xe2, 0x82],
        [0xed, 0xa0, 0x80],
        [0xf0, 0x28, 0x8c, 0x28],
      ]) {
        const bytes = Buffer.concat([
          Buffer.from('{"note":"'),
          Buffer.from(sequence),
          Buffer.from(`","input":"${MEDIA_URI}"}`),
        ]);
        const validated = await validateOtelJson(bytes);
        const normalized = Buffer.from(bytes.toString("utf8"));
        expect(validated.normalizedBytes()).toEqual(normalized);
        const batch = await validated.extract(true);
        try {
          expect(JSON.parse(batch.json()).note).toBe(
            JSON.parse(normalized.toString("utf8")).note,
          );
          expect(batch.media).toHaveLength(1);
          expect(await batch.mediaBody(0)).toEqual(MEDIA_BODY);
          expect(await batch.originalMedia(0)).toBe(MEDIA_URI);
        } finally {
          await batch.dispose();
          await validated.dispose();
        }
      }
    });

    it("leaves a surrogate-containing string inline while scanning siblings", async () => {
      const embedded = JSON.stringify({
        type: "file",
        mediaType: "image/png",
        data: MEDIA_BASE64,
        note: "\ud800",
      });
      const input = JSON.stringify({
        input: embedded,
        sibling: MEDIA_URI,
      });

      const validated = await validateOtelJson(Buffer.from(input));
      const batch = await validated.extract(true);
      try {
        expect(batch.media).toHaveLength(2);
        const compact = JSON.parse(batch.json()) as {
          input: string;
          sibling: string;
        };
        expect(JSON.parse(compact.input)).toEqual({
          type: "file",
          mediaType: "image/png",
          data: batch.media[0]?.reference,
          note: "\ud800",
        });
        expect(compact.sibling).toBe(batch.media[1]?.reference);
        for (const media of batch.media) {
          await expect(batch.mediaBody(media.index)).resolves.toEqual(
            MEDIA_BODY,
          );
        }
      } finally {
        await batch.dispose();
        await validated.dispose();
      }
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
        "embedded surrogate",
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
        const validated = await validateOtelJson(Buffer.from(input));
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
        JSON.stringify(
          contentTypes.map((type) => `data:${type};base64,${MEDIA_BASE64}`),
        ),
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
    const uri = MEDIA_URI;
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
      const compact = batch.takeJsonBuffer();
      expect(Buffer.isBuffer(compact)).toBe(true);
      expect(JSON.parse(compact.toString("utf8"))).toEqual({
        input: media.reference,
      });
      expect(() => batch.json()).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_JSON_CONSUMED" }),
      );
      expect(() => batch.takeJsonBuffer()).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_JSON_CONSUMED" }),
      );
      expect(media.sha256Hash).toBe(
        createHash("sha256").update(MEDIA_BODY).digest("base64"),
      );
      await expect(batch.mediaBody(1)).rejects.toThrow("unknown media index");

      const body = batch.mediaBody(media.index);
      const original = batch.originalMedia(media.index);
      await batch.dispose();
      expect(compact.toString("utf8")).toContain(media.reference);
      await expect(body).resolves.toEqual(MEDIA_BODY);
      await expect(original).resolves.toBe(uri);
      expect(() => batch.json()).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_CLOSED" }),
      );
      expect(() => batch.takeJsonBuffer()).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_CLOSED" }),
      );
      expect(() => batch.media).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_CLOSED" }),
      );
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

it(
  "pages large media descriptor registries with stable bounds",
  { retry: 0 },
  async () => {
    const count = 4_097;
    const uri = MEDIA_URI;
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify(Array.from({ length: count }, () => uri))),
    );
    const batch = await validated.extract(true);
    try {
      expect(batch.mediaCount()).toBe(count);
      expect(batch.mediaPage(0, 2).map((entry) => entry.index)).toEqual([0, 1]);
      expect(batch.mediaPage(4_095, 2).map((entry) => entry.index)).toEqual([
        4_095, 4_096,
      ]);
      expect(batch.mediaPage(count, 1)).toEqual([]);
      expect(() => batch.mediaPage(0, 0)).toThrow(/media page limit/);
      expect(() => batch.mediaPage(0, 4_097)).toThrow(/media page limit/);
      expect(() => batch.mediaPage(count + 1, 1)).toThrow(/offset/);

      await batch.dispose();
      expect(() => batch.mediaCount()).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_CLOSED" }),
      );
      expect(() => batch.mediaPage(0, 1)).toThrowError(
        expect.objectContaining({ code: "ERR_OTEL_CLOSED" }),
      );
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
  },
);
