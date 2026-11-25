import { notebookLayoutSchema } from "@/src/features/notebooks/schema";
import { collectNotebookValidationErrors } from "@/src/features/notebooks/server/fns/collectNotebookValidationErrors";
import { encodeDocument } from "@/src/features/notebooks/server/fns/encodeDocument";
import { promptExperiments } from "@/.storybook/fixtures/notebooks/promptExperiments";

describe("notebook layouts", () => {
  it("validates the single-document prompt experiments notebook", () => {
    const { layout, publications, variables, bindings } = promptExperiments;
    const documents = publications[0].documents.map(({ id, blocks }) => ({
      documentId: id,
      jsonl: blocks.map((block) => JSON.stringify(block)).join("\n"),
    }));
    expect(
      collectNotebookValidationErrors(
        documents,
        notebookLayoutSchema.parse({ kind: layout, variables, bindings }),
      ),
    ).toEqual([]);
  });

  it("validates selection bindings without checking live membership", () => {
    const table = {
      id: "runs",
      schema: "table@1",
      props: { columns: ["Run"], rows: [{ id: "one", cells: ["Run one"] }] },
    };
    const snapshot = [{ documentId: "main", jsonl: JSON.stringify(table) }];
    const write = {
      kind: "write" as const,
      variableId: "run",
      from: { documentId: "main", elementId: "runs", portId: "selection" },
    };
    const layout = notebookLayoutSchema.parse({
      kind: "default",
      variables: [
        { id: "run", name: "Run", type: "string", defaultValue: "unavailable" },
      ],
      bindings: [write],
    });
    expect(collectNotebookValidationErrors(snapshot, layout)).toEqual([]);
    expect(
      collectNotebookValidationErrors(snapshot, {
        ...layout,
        bindings: [write, write],
      }),
    ).toMatchObject([
      { message: expect.stringContaining("already has a selection source") },
    ]);
    expect(
      collectNotebookValidationErrors(snapshot, {
        ...layout,
        bindings: [{ kind: "read", variableId: "run", to: write.from }],
      }),
    ).toMatchObject([
      {
        documentId: "main",
        message: expect.stringContaining("Invalid read binding"),
      },
    ]);
  });

  it("rejects date range defaults with reversed endpoints", () => {
    expect(
      notebookLayoutSchema.safeParse({
        kind: "default",
        variables: [
          {
            id: "range",
            name: "Range",
            type: "dateRange",
            defaultValue: {
              start: "2026-01-02T00:00:00Z",
              end: "2026-01-01T00:00:00Z",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

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

  it.each(["inbox", "tabs"] as const)(
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
      notebookLayoutSchema.safeParse({ kind: "table", documents: [main] })
        .success,
    ).toBe(false);
    expect(
      notebookLayoutSchema.safeParse({
        kind: "inbox",
        width: "full",
        documents: [main],
      }).success,
    ).toBe(false);
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
