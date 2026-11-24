import { notebookLayoutSchema } from "@/src/features/notebooks/schema";
import { collectNotebookValidationErrors } from "@/src/features/notebooks/server/fns/collectNotebookValidationErrors";
import { encodeDocument } from "@/src/features/notebooks/server/fns/encodeDocument";

describe("notebook layouts", () => {
  const main = { documentId: "main", label: "Overview" };
  const detail = { documentId: "detail", label: "Investigation" };
  const documents = [
    { documentId: "main", jsonl: "" },
    { documentId: "detail", jsonl: "" },
  ];

  it("makes only main reachable in Default", () => {
    expect(
      collectNotebookValidationErrors(documents, { kind: "default" }),
    ).toMatchObject([{ documentId: "detail" }]);
  });

  it.each(["inbox", "tabs", "table"] as const)(
    "validates %s references against the snapshot",
    (kind) => {
      expect(
        collectNotebookValidationErrors(documents, {
          kind,
          documents: [detail, main],
        }),
      ).toEqual([]);
      expect(
        collectNotebookValidationErrors(documents, {
          kind,
          documents: [main, { documentId: "missing", label: "Missing" }],
        }),
      ).toMatchObject([{ documentId: "missing" }, { documentId: "detail" }]);
    },
  );

  it("rejects duplicate references and custom layouts", () => {
    expect(
      notebookLayoutSchema.safeParse({ kind: "tabs", documents: [main, main] })
        .success,
    ).toBe(false);
    expect(
      notebookLayoutSchema.safeParse({ kind: "custom", documents: [main] })
        .success,
    ).toBe(false);
    expect(
      notebookLayoutSchema.safeParse({ kind: "default", documents: [main] })
        .success,
    ).toBe(false);
  });

  it("validates inbox properties against the collection schema", () => {
    const propertySchema = {
      version: 1,
      fields: [
        { id: "priority", label: "Priority", type: "select", options: ["P1"] },
        { id: "confirmed", label: "Confirmed", type: "checkbox" },
      ],
      visibleByDefault: ["priority"],
    };
    const layout = {
      kind: "inbox",
      propertySchema,
      documents: [
        { ...main, properties: { priority: "P1", confirmed: false } },
        detail,
      ],
    };
    expect(notebookLayoutSchema.parse(layout)).toEqual(layout);
    for (const properties of [
      { priority: "P2" },
      { confirmed: "false" },
      { unknown: 0 },
    ]) {
      expect(
        notebookLayoutSchema.safeParse({
          ...layout,
          documents: [{ ...main, properties }],
        }).success,
      ).toBe(false);
    }
  });

  it("does not accept layout blocks within a document", () => {
    expect(() =>
      encodeDocument({
        blocks: [
          {
            schema: "row@1",
            props: {
              children: [{ schema: "tabs@1", props: { documents: [main] } }],
            },
          },
        ],
      }),
    ).toThrow();
  });
});
