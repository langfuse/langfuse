import { ZodError } from "zod";

import { applyDocumentPatch } from "@/src/features/notebooks/server/fns/applyDocumentPatch";
import { encodeDocument } from "@/src/features/notebooks/server/fns/encodeDocument";
import { parseDocument } from "@/src/features/notebooks/server/fns/parseDocument";

describe("notebook document format", () => {
  it("writes Markdown as native ProseMirror content and keeps row children inline", () => {
    const { jsonl } = encodeDocument({
      blocks: [
        {
          id: "comparison",
          schema: "row@1",
          props: {
            children: [
              {
                schema: "text@1",
                markdown: "## Root cause\n\nThe request **retried**.",
              },
            ],
          },
        },
        { id: "empty", schema: "row@1", props: { children: [] } },
      ],
    });
    expect(jsonl.split("\n")).toHaveLength(2);
    expect(parseDocument(jsonl)).toMatchObject([
      {
        id: "comparison",
        props: {
          children: [
            {
              id: expect.any(String),
              schema: "text@1",
              props: {},
              content: [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Root cause" }],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "The request " },
                    {
                      type: "text",
                      text: "retried",
                      marks: [{ type: "strong" }],
                    },
                    { type: "text", text: "." },
                  ],
                },
              ],
            },
          ],
        },
      },
      { id: "empty" },
    ]);
  });

  it("addresses nested blocks by stable ID and rejects duplicate IDs across rows", () => {
    const { jsonl } = encodeDocument({
      blocks: [
        {
          id: "row",
          schema: "row@1",
          props: {
            children: [{ id: "note", schema: "text@1", markdown: "before" }],
          },
        },
      ],
    });
    const output = applyDocumentPatch(jsonl, [
      {
        op: "replace",
        blockId: "note",
        block: { schema: "text@1", markdown: "after" },
      },
      {
        op: "insert",
        afterId: "note",
        block: { id: "other", schema: "text@1", markdown: "More notes" },
      },
    ]);
    expect(output.blocks).toMatchObject([
      { props: { children: [{ id: "note" }, { id: "other" }] } },
    ]);
    expect(() =>
      applyDocumentPatch(output.jsonl, [
        {
          op: "insert",
          block: { id: "note", schema: "text@1", markdown: "Duplicate" },
        },
      ]),
    ).toThrow("Duplicate block ID: note.");
  });

  it("rejects mixed text sources in a row and requires normalized stored blocks", () => {
    expect(() =>
      encodeDocument({
        blocks: [
          {
            schema: "row@1",
            props: {
              children: [{ schema: "text@1", markdown: "Note", content: [] }],
            },
          },
        ],
      }),
    ).toThrow(ZodError);

    expect(() =>
      parseDocument(
        JSON.stringify({
          id: "note",
          schema: "text@1",
          props: {},
          markdown: "Note",
        }),
      ),
    ).toThrow(ZodError);
    expect(() =>
      parseDocument(
        JSON.stringify({ schema: "text@1", props: {}, content: [] }),
      ),
    ).toThrow(ZodError);
  });

  it("rejects ambiguous insert positions and replacements that change the block ID", () => {
    const { jsonl } = encodeDocument({
      blocks: [{ id: "note", schema: "text@1", markdown: "Note" }],
    });
    expect(() =>
      applyDocumentPatch(jsonl, [
        {
          op: "insert",
          beforeId: "note",
          afterId: "note",
          block: { schema: "text@1", markdown: "More" },
        },
      ]),
    ).toThrow(ZodError);
    expect(() =>
      applyDocumentPatch(jsonl, [
        {
          op: "replace",
          blockId: "note",
          block: { id: "other", schema: "text@1", markdown: "More" },
        },
      ]),
    ).toThrow(ZodError);
  });

  it("validates a metrics-backed chart without storing query results", () => {
    const { jsonl } = encodeDocument({
      blocks: [
        {
          id: "latency-over-time",
          schema: "chart@1",
          props: {
            title: "Average latency",
            query: {
              schema: "metrics@2",
              view: "observations",
              metrics: [{ measure: "latency", aggregation: "avg" }],
              fromTimestamp: "2026-11-23T08:00:00Z",
              toTimestamp: "2026-11-23T11:00:00Z",
              timeDimension: { granularity: "hour" },
            },
            display: { kind: "line" },
          },
        },
      ],
    });
    expect(parseDocument(jsonl)).toMatchObject([
      {
        id: "latency-over-time",
        props: {
          query: {
            schema: "metrics@2",
            metrics: [{ measure: "latency", aggregation: "avg" }],
          },
        },
      },
    ]);
  });

  it("validates nested chart queries on write and explicit validation, not on read", () => {
    const row = {
      id: "row",
      schema: "row@1",
      props: {
        children: [
          {
            id: "chart",
            schema: "chart@1",
            props: {
              query: {
                schema: "metrics@2",
                view: "observations",
                metrics: [{ measure: "nonexistent", aggregation: "sum" }],
                fromTimestamp: "2026-11-23T08:00:00Z",
                toTimestamp: "2026-11-23T11:00:00Z",
              },
              display: { kind: "bar" },
            },
          },
        ],
      },
    };
    const jsonl = JSON.stringify(row);
    const error = "Unknown chart measure: nonexistent.";

    expect(() => encodeDocument({ blocks: [row] })).toThrow(error);
    expect(() => parseDocument(jsonl, "validate")).toThrow(error);
    expect(parseDocument(jsonl)).toMatchObject([row]);
  });
});
