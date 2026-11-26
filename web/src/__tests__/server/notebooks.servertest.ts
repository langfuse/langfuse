import { createSession } from "@/src/__tests__/fixtures/session-factory";
import {
  createNotebook,
  getNotebook,
  patchDocument,
  publishNotebook,
  readDocument,
  updateNotebookLayout,
  validateNotebook,
  writeDocument,
} from "@/src/features/notebooks/server/notebookService";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

describe("notebooks", () => {
  const orgIds: string[] = [];

  async function project() {
    const setup = await createOrgProjectAndApiKey();
    orgIds.push(setup.org.id);
    const session = createSession({
      organizations: [
        {
          id: setup.org.id,
          name: setup.org.name,
          role: "MEMBER",
          plan: "oss",
          aiTelemetryEnabled: true,
          projects: [
            {
              id: setup.project.id,
              name: setup.project.name,
              role: "VIEWER",
              retentionDays: null,
            },
          ],
        },
      ],
    });
    const { id: projectId } = setup.project;
    const caller = appRouter.createCaller(
      createInnerTRPCContext({ session, headers: {} }),
    );
    return { projectId, caller };
  }

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  it("versions width-only edits and preserves them when republishing history", async () => {
    const { projectId, caller } = await project();
    const { notebookId } = await createNotebook({
      projectId,
      title: "Dashboard",
      layout: "tabs",
    });
    const key = { projectId, notebookId };
    const main = { ...key, documentId: "main" };
    const { jsonl } = await writeDocument({ ...main, markdown: "Overview" });
    const detail = await writeDocument({
      ...key,
      label: "Details",
      markdown: "Charts",
      width: "full",
    });
    await publishNotebook(key);

    const resized = await writeDocument({ ...main, width: "full" });
    expect(resized).toMatchObject({
      width: "full",
      jsonl,
      dirty: true,
      notebookDirty: true,
    });
    await expect(getNotebook(key)).resolves.toMatchObject({
      dirtyDocumentIds: ["main"],
    });
    await expect(
      readDocument({ ...main, revision: resized.revision }),
    ).resolves.toMatchObject({
      width: "full",
      jsonl,
    });
    await expect(
      publishNotebook({ ...key, sourceVersion: 1 }),
    ).resolves.toMatchObject({ version: 2, dirty: true });
    await expect(caller.notebooks.view(key)).resolves.toMatchObject({
      isDraft: true,
      width: "full",
    });
    await expect(
      caller.notebooks.view({ ...key, version: 2 }),
    ).resolves.toMatchObject({ width: "contained" });
    await expect(
      caller.notebooks.view({ ...key, documentId: detail.documentId }),
    ).resolves.toMatchObject({ width: "full" });

    await expect(writeDocument({ ...main, jsonl })).resolves.toMatchObject({
      width: "full",
      revision: resized.revision,
    });
    await expect(publishNotebook(key)).resolves.toMatchObject({
      version: 3,
      dirty: false,
    });
    await expect(readDocument({ ...main, version: 1 })).resolves.toMatchObject({
      width: "contained",
      jsonl,
    });
    await expect(readDocument({ ...main, version: 3 })).resolves.toMatchObject({
      width: "full",
      jsonl,
    });
  });

  it("recovers staged content and reads immutable published versions through project-scoped links", async () => {
    const { projectId, caller } = await project();
    const { caller: outsider, projectId: otherProjectId } = await project();
    const { notebookId } = await createNotebook({
      projectId,
      title: "Incident review",
      layout: "inbox",
    });
    const key = { projectId, notebookId };
    const first = await writeDocument({
      ...key,
      documentId: "main",
      markdown: "First",
    });
    const issue = await writeDocument({
      ...key,
      label: "Investigation",
      markdown: "Initial issue",
    });
    await expect(getNotebook(key)).resolves.toMatchObject({
      dirty: true,
      version: null,
    });
    await expect(validateNotebook(key)).resolves.toMatchObject({
      dirty: true,
      valid: true,
    });
    await expect(caller.notebooks.view(key)).resolves.toMatchObject({
      isDraft: true,
      blocks: first.blocks,
    });
    await expect(
      caller.notebooks.view({ ...key, documentId: issue.documentId }),
    ).rejects.toThrow();
    await expect(
      caller.notebooks.view({ ...key, draftDocumentId: issue.documentId }),
    ).resolves.toMatchObject({
      isDraft: true,
      documentId: issue.documentId,
      blocks: issue.blocks,
    });
    await expect(outsider.notebooks.view(key)).rejects.toThrow(
      "Notebook not found.",
    );
    await expect(
      outsider.notebooks.view({ notebookId, projectId: otherProjectId }),
    ).rejects.toThrow("Notebook not found.");
    await expect(
      outsider.notebooks.chart({ ...key, blockId: "latency" }),
    ).rejects.toThrow("Notebook not found.");

    await expect(publishNotebook(key)).resolves.toMatchObject({
      version: 1,
      dirty: false,
      url: `/project/${projectId}/notebooks/${notebookId}?version=1`,
    });
    const second = await writeDocument({
      ...key,
      documentId: "main",
      markdown: "Second",
    });
    await expect(publishNotebook(key)).resolves.toMatchObject({
      version: 2,
      dirty: false,
    });
    const unpublished = await writeDocument({
      ...key,
      documentId: "main",
      markdown: "Survives interruption",
    });
    await expect(caller.notebooks.view(key)).resolves.toMatchObject({
      isDraft: true,
      blocks: unpublished.blocks,
    });
    await expect(
      caller.notebooks.view({ ...key, documentId: "main" }),
    ).resolves.toMatchObject({
      version: 2,
      blocks: second.blocks,
      versions: [
        { number: 2, publishedAt: expect.any(Date) },
        { number: 1, publishedAt: expect.any(Date) },
      ],
    });
    await expect(
      caller.notebooks.view({
        ...key,
        documentId: issue.documentId,
        version: 1,
      }),
    ).resolves.toMatchObject({ version: 1, blocks: issue.blocks });

    await expect(
      publishNotebook({ ...key, sourceVersion: 1 }),
    ).resolves.toMatchObject({ version: 3, dirty: true });
    await expect(readDocument({ ...key, version: 3 })).resolves.toMatchObject({
      blocks: first.blocks,
    });
    await expect(readDocument({ ...key, version: 2 })).resolves.toMatchObject({
      blocks: second.blocks,
    });
    await expect(readDocument({ ...key, staged: true })).resolves.toMatchObject(
      { jsonl: unpublished.jsonl, dirty: true },
    );
    await expect(publishNotebook(key)).resolves.toMatchObject({
      version: 4,
      dirty: false,
    });
  });

  it("only adds documents through multi-document layouts and blocks publishing unreachable documents", async () => {
    const { projectId, caller } = await project();
    const { notebookId } = await createNotebook({ projectId, title: "Layout" });
    const key = { projectId, notebookId };
    await expect(getNotebook(key)).resolves.toMatchObject({
      layout: { kind: "default" },
    });
    await expect(
      writeDocument({ ...key, label: "Extra", markdown: "Not allowed" }),
    ).rejects.toBeInstanceOf(InvalidRequestError);
    await expect(
      writeDocument({ ...key, documentId: "extra", markdown: "Not allowed" }),
    ).rejects.toBeInstanceOf(LangfuseNotFoundError);

    const main = { documentId: "main", label: "Overview" };
    await updateNotebookLayout({
      ...key,
      layout: { kind: "tabs", documents: [main] },
    });
    const { documentId } = await writeDocument({
      ...key,
      label: "Extra",
      markdown: "Extra document",
    });
    const missing = { documentId: "missing", label: "Missing" };
    await updateNotebookLayout({
      ...key,
      layout: { kind: "tabs", documents: [main, missing] },
    });
    await expect(validateNotebook(key)).resolves.toMatchObject({
      valid: false,
      errors: [{ documentId: "missing" }, { documentId }],
    });
    await expect(
      caller.notebooks.view({ ...key, draftDocumentId: documentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(publishNotebook(key)).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
    await updateNotebookLayout({ ...key, layout: { kind: "default" } });
    await expect(validateNotebook(key)).resolves.toMatchObject({
      valid: false,
      errors: [{ documentId, message: expect.stringContaining("hides") }],
    });
    await expect(publishNotebook(key)).rejects.toThrow(documentId);
    await expect(
      writeDocument({ ...key, documentId, markdown: "Edited while hidden" }),
    ).resolves.toMatchObject({ documentId });

    await updateNotebookLayout({
      ...key,
      layout: {
        kind: "tabs",
        documents: [main, { documentId, label: "Extra" }],
      },
    });
    await expect(
      readDocument({ ...key, documentId, staged: true }),
    ).resolves.toMatchObject({
      documentId,
      jsonl: expect.stringContaining("Edited while hidden"),
    });
    await expect(publishNotebook(key)).resolves.toMatchObject({ version: 1 });

    await updateNotebookLayout({
      ...key,
      layout: { kind: "default" },
    });
    await expect(publishNotebook(key)).rejects.toThrow(documentId);
    await expect(
      readDocument({ ...key, documentId, staged: true }),
    ).resolves.toMatchObject({
      documentId,
      jsonl: expect.stringContaining("Edited while hidden"),
    });
    await expect(
      readDocument({ ...key, documentId, version: 1 }),
    ).resolves.toMatchObject({ documentId });
  });

  it("snapshots layout-only changes and keeps them when republishing an older version", async () => {
    const { projectId, caller } = await project();
    const { notebookId } = await createNotebook({
      projectId,
      title: "Versions",
      layout: "tabs",
    });
    const key = { projectId, notebookId };
    const { documentId } = await writeDocument({
      ...key,
      label: "Investigation",
      markdown: "Details",
    });
    await publishNotebook(key);
    const inbox = {
      kind: "inbox",
      documents: [
        { documentId, label: "Investigate" },
        { documentId: "main", label: "Overview" },
      ],
    } as const;
    await expect(
      updateNotebookLayout({
        ...key,
        layout: { ...inbox, documents: [...inbox.documents] },
      }),
    ).resolves.toMatchObject({ notebookDirty: true });
    await expect(getNotebook(key)).resolves.toMatchObject({
      dirty: true,
      dirtyDocumentIds: [],
      layout: { kind: "tabs" },
      stagedLayout: inbox,
    });
    await expect(
      publishNotebook({ ...key, sourceVersion: 1 }),
    ).resolves.toMatchObject({
      version: 2,
      dirty: true,
    });
    await expect(caller.notebooks.view(key)).resolves.toMatchObject({
      isDraft: true,
      layout: inbox,
      documentId,
    });
    await expect(publishNotebook(key)).resolves.toMatchObject({
      version: 3,
      dirty: false,
    });
    await expect(
      caller.notebooks.view({ ...key, version: 1 }),
    ).resolves.toMatchObject({
      documentId: "main",
      layout: { kind: "tabs" },
    });
    await expect(
      caller.notebooks.view({ ...key, version: 3 }),
    ).resolves.toMatchObject({
      documentId,
      layout: inbox,
    });
  });

  it("warns about likely overflow in an automatically sized row without blocking publishing", async () => {
    const { projectId } = await project();
    const { notebookId } = await createNotebook({
      projectId,
      title: "Presentation",
    });
    const key = { projectId, notebookId };
    await writeDocument({
      ...key,
      documentId: "main",
      blocks: [
        {
          schema: "row@1",
          props: {
            children: [
              {
                id: "notes",
                schema: "text@1",
                markdown: "Notes fit on their own line.",
              },
              {
                id: "large-table",
                schema: "table@1",
                props: {
                  columns: Array.from(
                    { length: 10 },
                    (_, index) => `Column ${index + 1}`,
                  ),
                  rows: [],
                },
              },
            ],
          },
        },
      ],
    });
    await expect(
      validateNotebook({ ...key, documentId: "main" }),
    ).resolves.toMatchObject({
      valid: true,
      errors: [],
      warnings: [
        { documentId: "main", blockId: "large-table", code: "wide_table" },
      ],
    });
    await expect(publishNotebook(key)).resolves.toMatchObject({ version: 1 });
  });

  it("coalesces edits by user, preserves tagged revisions, and rolls back failed patches", async () => {
    const { projectId } = await project();
    const { notebookId } = await createNotebook({
      projectId,
      title: "Working notes",
      layout: "tabs",
    });
    const key = {
      projectId,
      notebookId,
      userId: "first-user",
      documentId: "main",
    };
    const row = {
      id: "comparison",
      schema: "row@1" as const,
      props: { children: [] },
    };
    const initial = await writeDocument({ ...key, blocks: [row] });
    const insert = {
      op: "insert" as const,
      parentId: "comparison",
      block: { id: "note", schema: "text@1" as const, markdown: "Initial" },
    };
    const inserted = await patchDocument({ ...key, operations: [insert] });
    expect(inserted.revision).toBe(initial.revision);
    await expect(
      patchDocument({
        ...key,
        operations: [
          { op: "remove", blockId: "note" },
          { op: "remove", blockId: "missing" },
        ],
      }),
    ).rejects.toThrow("Block not found: missing.");
    await expect(readDocument({ ...key, staged: true })).resolves.toMatchObject(
      { jsonl: inserted.jsonl },
    );

    const second = await writeDocument({
      projectId,
      notebookId,
      userId: key.userId,
      label: "Second",
      markdown: "Different document",
    });
    expect(second.revision).toBe(initial.revision);
    const replaced = await patchDocument({
      ...key,
      userId: "second-user",
      operations: [
        {
          op: "replace",
          blockId: "note",
          block: { schema: "text@1", markdown: "Updated" },
        },
      ],
    });
    expect(replaced.revision).toBe(initial.revision + 1);
    await prisma.notebookVersion.update({
      where: { notebookId_number: { notebookId, number: replaced.revision } },
      data: { editedAt: new Date(0) },
    });
    const removed = await patchDocument({
      ...key,
      userId: "second-user",
      operations: [{ op: "remove", blockId: "note" }],
    });
    expect(removed.revision).toBe(replaced.revision + 1);
    await expect(
      publishNotebook({ ...key, sourceRevision: inserted.revision }),
    ).resolves.toMatchObject({ version: 1, dirty: true });
    await expect(readDocument({ ...key, version: 1 })).resolves.toMatchObject({
      jsonl: inserted.jsonl,
    });
    await expect(
      patchDocument({ ...key, userId: "second-user", operations: [insert] }),
    ).resolves.toMatchObject({ revision: removed.revision + 1 });
  });
});
