import { getDirtyDocumentIds } from "@/src/features/notebooks/server/fns/getDirtyDocumentIds";

it("detects width-only edits without changing the body hash", () => {
  const published = {
    documentId: "main",
    contentHash: "same",
    width: "contained",
  } as const;
  expect(
    getDirtyDocumentIds([{ ...published, width: "full" }], [published]),
  ).toEqual(new Set(["main"]));
  expect(getDirtyDocumentIds([{ ...published }], [published])).toEqual(
    new Set(),
  );
});
