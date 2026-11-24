import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  buildNotebookPath,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma, type Prisma } from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";
import {
  MAIN_NOTEBOOK_DOCUMENT,
  MAX_NOTEBOOK_DOCUMENTS,
  notebookDocumentLabel,
  notebookDocumentWidth,
  notebookLayoutKind,
  notebookLayoutSchema,
  type NotebookDocumentWidth,
  type NotebookLayout,
} from "../schema";
import { applyDocumentPatch } from "./fns/applyDocumentPatch";
import { collectNotebookValidationErrors } from "./fns/collectNotebookValidationErrors";
import { encodeDocument } from "./fns/encodeDocument";
import { getDirtyDocumentIds } from "./fns/getDirtyDocumentIds";
import { getNotebookLayoutDocumentIds } from "./fns/getNotebookLayoutDocumentIds";
import { parseDocument } from "./fns/parseDocument";

// Version 0 is the single durable candidate. Only published versions are linkable by number.
const STAGED = 0;
const EDIT_IDLE_MS = 30_000;
const PAGE_SIZE = 50;
const EMPTY_HASH = createHash("sha256").update("").digest("hex");
const documentIndexSelect = {
  documentId: true,
  contentHash: true,
  width: true,
} as const;

type NotebookKey = { projectId: string; notebookId: string };

function getDocumentUrl(
  { projectId, notebookId }: NotebookKey,
  documentId: string,
  version: number | null,
  reachableIds: ReadonlySet<string>,
) {
  if (!reachableIds.has(documentId)) return null;
  if (!version)
    return buildNotebookPath({
      projectId,
      notebookId,
      draftDocumentId: documentId,
    });
  return buildNotebookPath({ projectId, notebookId, documentId, version });
}
type Db = Prisma.TransactionClient;
type EditTarget = NotebookKey & { documentId: string; runKey?: string };

async function getNotebookRow(db: Db, { projectId, notebookId }: NotebookKey) {
  const notebook = await db.notebook.findUnique({
    where: { id_projectId: { id: notebookId, projectId } },
  });
  if (!notebook) throw new LangfuseNotFoundError("Notebook not found.");
  return notebook;
}

async function lockProject(tx: Db, projectId: string) {
  // A run can switch notebooks; serialize edits and publication across the project
  // so changing its open group and writing a document commit together.
  await tx.$queryRaw`
    SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`notebooks:${projectId}`}, 0))
  `;
}

async function findDocumentIndex(db: Db, notebookId: string, version: number) {
  return db.notebookVersionDocument.findMany({
    where: { notebookId, version },
    select: documentIndexSelect,
    orderBy: { documentId: "asc" },
  });
}

async function readNotebookLayout(db: Db, notebookId: string, number: number) {
  const snapshot = await db.notebookVersion.findUnique({
    where: { notebookId_number: { notebookId, number } },
    select: { layout: true },
  });
  if (!snapshot) throw new LangfuseNotFoundError("Notebook version not found.");
  return notebookLayoutSchema.parse(snapshot.layout);
}

async function isNotebookDirty(
  db: Db,
  notebookId: string,
  latestPublishedVersion: number | null,
  dirtyDocuments: ReadonlySet<string>,
  stagedLayout: NotebookLayout,
) {
  if (!latestPublishedVersion || dirtyDocuments.size > 0) return true;
  const publishedLayout = await readNotebookLayout(
    db,
    notebookId,
    latestPublishedVersion,
  );
  return !isDeepStrictEqual(stagedLayout, publishedLayout);
}

async function readIndexes(
  db: Db,
  notebookId: string,
  latestPublishedVersion: number | null,
) {
  const [staged, published] = await Promise.all([
    findDocumentIndex(db, notebookId, STAGED),
    latestPublishedVersion
      ? findDocumentIndex(db, notebookId, latestPublishedVersion)
      : [],
  ]);
  return { staged, published, dirty: getDirtyDocumentIds(staged, published) };
}

export async function listNotebooks(input: {
  projectId: string;
  search?: string;
  cursor?: string;
}) {
  const rows = await prisma.notebook.findMany({
    where: {
      projectId: input.projectId,
      id: input.cursor ? { gt: input.cursor } : undefined,
      title: input.search
        ? { contains: escapeSqlLikePattern(input.search), mode: "insensitive" }
        : undefined,
    },
    take: PAGE_SIZE + 1,
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      latestPublishedVersion: true,
      dirty: true,
      updatedAt: true,
    },
  });
  const page = rows.slice(0, PAGE_SIZE);
  return {
    notebooks: page.map(({ latestPublishedVersion, ...notebook }) => ({
      ...notebook,
      publishedVersion: latestPublishedVersion,
      url: buildNotebookPath({
        projectId: input.projectId,
        notebookId: notebook.id,
      }),
    })),
    nextCursor: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function getNotebook(input: NotebookKey & { version?: number }) {
  return prisma.$transaction(
    async (tx) => {
      const notebook = await getNotebookRow(tx, input);
      const version = input.version ?? notebook.latestPublishedVersion;
      const { staged, published, dirty } = await readIndexes(
        tx,
        notebook.id,
        notebook.latestPublishedVersion,
      );
      const snapshots = await tx.notebookVersion.findMany({
        where: { notebookId: notebook.id, publishedAt: { not: null } },
        select: { number: true, publishedAt: true },
        orderBy: { number: "desc" },
      });
      const snapshot = snapshots.find(({ number }) => number === version);
      if (version && !snapshot)
        throw new LangfuseNotFoundError("Notebook version not found.");
      let index = published;
      if (version === null) {
        index = staged;
      } else if (version !== notebook.latestPublishedVersion) {
        index = await findDocumentIndex(tx, notebook.id, version);
      }
      const stagedLayout = await readNotebookLayout(tx, notebook.id, STAGED);
      const layout =
        version === null
          ? stagedLayout
          : await readNotebookLayout(tx, notebook.id, version);
      const reachableIds = new Set(getNotebookLayoutDocumentIds(layout));
      return {
        notebookId: notebook.id,
        title: notebook.title,
        version,
        publishedAt: snapshot?.publishedAt ?? null,
        latestPublishedVersion: notebook.latestPublishedVersion,
        versions: snapshots.map(({ number }) => number),
        dirty: notebook.dirty,
        layout,
        stagedLayout,
        url: buildNotebookPath({
          projectId: input.projectId,
          notebookId: notebook.id,
          version,
        }),
        documents: index.map(({ documentId, width }) => ({
          id: documentId,
          width,
          dirty: dirty.has(documentId),
          url: getDocumentUrl(input, documentId, version, reachableIds),
        })),
        stagedDocuments: staged.map(({ documentId, width }) => ({
          id: documentId,
          width,
          dirty: dirty.has(documentId),
        })),
        dirtyDocumentIds: [...dirty],
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function createNotebook(input: {
  projectId: string;
  title: string;
  layout?: NotebookLayout["kind"];
}) {
  const kind = notebookLayoutKind.parse(input.layout ?? "default");
  const layout: NotebookLayout =
    kind === "default"
      ? { kind }
      : {
          kind,
          documents: [{ documentId: MAIN_NOTEBOOK_DOCUMENT, label: "Main" }],
        };
  const notebook = await prisma.notebook.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      versions: {
        create: {
          number: STAGED,
          layout,
          documents: {
            create: {
              documentId: MAIN_NOTEBOOK_DOCUMENT,
              jsonl: "",
              contentHash: EMPTY_HASH,
            },
          },
        },
      },
    },
  });
  return {
    notebookId: notebook.id,
    title: notebook.title,
    documentId: MAIN_NOTEBOOK_DOCUMENT,
    layout,
    dirty: true,
    url: buildNotebookPath({
      projectId: input.projectId,
      notebookId: notebook.id,
    }),
  };
}

async function findCandidate(
  db: Db,
  notebookId: string,
  version: number,
  documentId?: string,
) {
  const candidate = await db.notebookVersion.findUnique({
    where: { notebookId_number: { notebookId, number: version } },
    include: {
      documents: { where: { documentId }, orderBy: { documentId: "asc" } },
    },
  });
  if (!candidate)
    throw new LangfuseNotFoundError("Notebook version not found.");
  if (documentId && !candidate.documents.length)
    throw new LangfuseNotFoundError("Document not found.");
  return {
    documents: candidate.documents,
    layout: notebookLayoutSchema.parse(candidate.layout),
  };
}

export async function validateNotebook(
  input: NotebookKey & { documentId?: string; sourceVersion?: number },
) {
  return prisma.$transaction(
    async (tx) => {
      const notebook = await getNotebookRow(tx, input);
      const { documents, layout } = await findCandidate(
        tx,
        notebook.id,
        input.sourceVersion ?? STAGED,
        input.documentId,
      );
      const errors = collectNotebookValidationErrors(
        documents,
        input.documentId === undefined ? layout : undefined,
      );
      const { dirty } = await readIndexes(
        tx,
        notebook.id,
        notebook.latestPublishedVersion,
      );
      return {
        valid: errors.length === 0,
        errors,
        sourceVersion: input.sourceVersion ?? null,
        dirty: input.documentId ? dirty.has(input.documentId) : notebook.dirty,
        checkedDocumentIds: documents.map(({ documentId }) => documentId),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function publishNotebook(
  input: NotebookKey & { sourceVersion?: number },
) {
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, input.projectId);
    const notebook = await getNotebookRow(tx, input);
    const sourceVersion = input.sourceVersion ?? STAGED;
    const { documents, layout } = await findCandidate(
      tx,
      notebook.id,
      sourceVersion,
    );
    const errors = collectNotebookValidationErrors(documents, layout);
    if (errors.length) {
      throw new InvalidRequestError(
        errors
          .map(({ documentId, message }) =>
            documentId ? `${documentId}: ${message}` : message,
          )
          .join("\n"),
      );
    }
    if (
      !input.sourceVersion &&
      !notebook.dirty &&
      notebook.latestPublishedVersion
    ) {
      const version = notebook.latestPublishedVersion;
      return {
        notebookId: notebook.id,
        version,
        dirty: false,
        url: buildNotebookPath({
          projectId: input.projectId,
          notebookId: notebook.id,
          version,
        }),
      };
    }

    const version = (notebook.latestPublishedVersion ?? 0) + 1;
    const snapshot = documents.map(
      ({ documentId, jsonl, contentHash, width }) => ({
        documentId,
        jsonl,
        contentHash,
        width,
      }),
    );
    await tx.notebookVersion.create({
      data: {
        notebookId: notebook.id,
        number: version,
        publishedAt: new Date(),
        layout,
        documents: { createMany: { data: snapshot } },
      },
    });
    let dirty = false;
    const isRepublishing = sourceVersion !== STAGED;
    if (isRepublishing && notebook.dirty) {
      const staged = await findDocumentIndex(tx, notebook.id, STAGED);
      const stagedLayout = await readNotebookLayout(tx, notebook.id, STAGED);
      dirty =
        getDirtyDocumentIds(staged, snapshot).size > 0 ||
        !isDeepStrictEqual(stagedLayout, layout);
    } else if (isRepublishing) {
      await tx.notebookVersionDocument.deleteMany({
        where: { notebookId: notebook.id, version: STAGED },
      });
      await tx.notebookVersionDocument.createMany({
        data: snapshot.map((document) => ({
          ...document,
          notebookId: notebook.id,
          version: STAGED,
        })),
      });
      await tx.notebookVersion.update({
        where: {
          notebookId_number: { notebookId: notebook.id, number: STAGED },
        },
        data: { layout },
      });
    }
    await tx.notebook.update({
      where: { id: notebook.id },
      data: { latestPublishedVersion: version, dirty },
    });
    await tx.notebookEditGroup.updateMany({
      where: { notebookId: notebook.id, closedAt: null },
      data: { closedAt: new Date() },
    });
    return {
      notebookId: notebook.id,
      version,
      dirty,
      url: buildNotebookPath({
        projectId: input.projectId,
        notebookId: notebook.id,
        version,
      }),
    };
  });
}

type ReadTarget = NotebookKey & {
  documentId?: string;
  version?: number;
  staged?: boolean;
  preferStaged?: boolean;
  respectLayout?: boolean;
};

export async function readDocument(input: ReadTarget) {
  if (input.staged && input.version !== undefined) {
    throw new InvalidRequestError(
      "Choose either the staged document or a published version.",
    );
  }
  const resolve = async (tx: Db) => {
    const notebook = await getNotebookRow(tx, input);
    const useDraft = input.staged || (input.preferStaged && notebook.dirty);
    const version = useDraft
      ? STAGED
      : (input.version ?? notebook.latestPublishedVersion);
    if (version === null)
      throw new LangfuseNotFoundError(
        "Notebook has not been published. Read the staged document instead.",
      );
    const { staged, published, dirty } = await readIndexes(
      tx,
      notebook.id,
      notebook.latestPublishedVersion,
    );
    const index = await (async () => {
      if (version === STAGED) return staged;
      if (version === notebook.latestPublishedVersion) return published;
      return findDocumentIndex(tx, notebook.id, version);
    })();
    const layout = await readNotebookLayout(tx, notebook.id, version);
    const layoutDocumentIds = new Set(getNotebookLayoutDocumentIds(layout));
    const documentId =
      input.documentId ??
      (input.respectLayout
        ? [...layoutDocumentIds].find((id) =>
            index.some(({ documentId }) => id === documentId),
          )
        : MAIN_NOTEBOOK_DOCUMENT);
    if (
      !documentId ||
      (input.respectLayout && !layoutDocumentIds.has(documentId))
    ) {
      throw new LangfuseNotFoundError(
        "Document is not reachable from the requested notebook layout.",
      );
    }
    const document = await tx.notebookVersionDocument.findUnique({
      where: {
        notebookId_version_documentId: {
          notebookId: notebook.id,
          version,
          documentId,
        },
      },
    });
    if (!document) {
      throw new LangfuseNotFoundError(
        "Document not found in the requested version.",
      );
    }
    const versions = await tx.notebookVersion.findMany({
      where: { notebookId: notebook.id, publishedAt: { not: null } },
      select: { number: true, publishedAt: true },
      orderBy: { number: "desc" },
    });
    return {
      projectId: notebook.projectId,
      notebookId: notebook.id,
      title: notebook.title,
      layout,
      documentId,
      width: document.width,
      version: version || null,
      dirty: dirty.has(documentId),
      notebookDirty: notebook.dirty,
      isDraft: version === STAGED,
      url: getDocumentUrl(input, documentId, version, layoutDocumentIds),
      documents: index.map(({ documentId }) => ({
        id: documentId,
        url: getDocumentUrl(input, documentId, version, layoutDocumentIds),
      })),
      versions: versions.flatMap(({ number, publishedAt }) =>
        publishedAt ? [{ number, publishedAt }] : [],
      ),
      blocks: parseDocument(document.jsonl),
      jsonl: document.jsonl,
    };
  };

  return prisma.$transaction(resolve, { isolationLevel: "RepeatableRead" });
}

async function closeEditGroups(tx: Db, target: EditTarget, now: Date) {
  const { projectId, notebookId, documentId, runKey } = target;
  const close: Prisma.NotebookEditGroupWhereInput[] = [];
  if (runKey) {
    close.push({
      runKey,
      OR: [
        { notebookId: { not: notebookId } },
        { documentId: { not: documentId } },
        { updatedAt: { lte: new Date(now.getTime() - EDIT_IDLE_MS) } },
      ],
    });
  }
  close.push(
    runKey
      ? { notebookId, documentId, runKey: { not: runKey } }
      : { notebookId, documentId },
  );
  if (close.length) {
    await tx.notebookEditGroup.updateMany({
      where: { projectId, closedAt: null, OR: close },
      data: { closedAt: now },
    });
  }
}

async function saveEdit(
  target: EditTarget,
  command:
    | {
        kind: "add";
        title: string;
        body: ReturnType<typeof encodeDocument>;
        width?: NotebookDocumentWidth;
      }
    | {
        kind: "replace";
        body: ReturnType<typeof encodeDocument>;
        width?: NotebookDocumentWidth;
      }
    | { kind: "resize"; width: NotebookDocumentWidth }
    | {
        kind: "patch";
        operations: Parameters<typeof applyDocumentPatch>[1];
        width?: never;
      },
) {
  const { notebookId, documentId, runKey } = target;
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, target.projectId);
    const notebook = await getNotebookRow(tx, target);
    const where = {
      notebookId_version_documentId: {
        notebookId,
        version: STAGED,
        documentId,
      },
    };
    const staged = await tx.notebookVersionDocument.findUnique({ where });
    const layout = await readNotebookLayout(tx, notebookId, STAGED);
    let stagedLayout = layout;
    if (command.kind === "add") {
      if (layout.kind === "default") {
        throw new InvalidRequestError(
          "Only Inbox, Tabs, and Table layouts can add documents.",
        );
      }
      const count = await tx.notebookVersionDocument.count({
        where: { notebookId, version: STAGED },
      });
      if (
        count >= MAX_NOTEBOOK_DOCUMENTS ||
        layout.documents.length >= MAX_NOTEBOOK_DOCUMENTS
      ) {
        throw new InvalidRequestError(
          `A notebook can have at most ${MAX_NOTEBOOK_DOCUMENTS} documents.`,
        );
      }
      stagedLayout = {
        ...layout,
        documents: [...layout.documents, { documentId, title: command.title }],
      };
      await tx.notebookVersion.update({
        where: { notebookId_number: { notebookId, number: STAGED } },
        data: { layout: stagedLayout },
      });
    } else {
      if (!staged)
        throw new LangfuseNotFoundError(
          "Staged document not found. Add it through Inbox or Tabs first.",
        );
    }
    const previous = staged?.jsonl ?? "";
    const { blocks, jsonl } = (() => {
      if (command.kind === "patch")
        return applyDocumentPatch(previous, command.operations);
      if (command.kind === "resize")
        return { blocks: parseDocument(previous), jsonl: previous };
      return command.body;
    })();
    const width = command.width ?? staged?.width ?? "contained";
    const contentChanged = !staged || staged.jsonl !== jsonl;
    const changed = contentChanged || staged.width !== width;
    const now = new Date();
    if (changed) await closeEditGroups(tx, target, now);

    let historyEntryId: string | null = null;
    if (changed) {
      const contentHash = contentChanged
        ? createHash("sha256").update(jsonl).digest("hex")
        : staged.contentHash;
      const data = { jsonl, contentHash, width };
      await tx.notebookVersionDocument.upsert({
        where,
        update: contentChanged ? data : { width },
        create: { ...data, notebookId, documentId, version: STAGED },
      });
      const group = runKey
        ? await tx.notebookEditGroup.findFirst({
            where: { ...target, closedAt: null },
            select: { id: true },
          })
        : null;
      const entry = group
        ? await tx.notebookEditGroup.update({
            where: { id: group.id },
            data: { afterJsonl: jsonl, afterWidth: width, updatedAt: now },
            select: { id: true },
          })
        : await tx.notebookEditGroup.create({
            data: {
              notebookId,
              projectId: target.projectId,
              documentId,
              runKey,
              beforeJsonl: staged?.jsonl ?? null,
              afterJsonl: jsonl,
              beforeWidth: staged?.width ?? null,
              afterWidth: width,
              closedAt: runKey ? null : now,
              updatedAt: now,
            },
            select: { id: true },
          });
      historyEntryId = entry.id;
    }
    const { dirty } = await readIndexes(
      tx,
      notebookId,
      notebook.latestPublishedVersion,
    );
    const notebookDirty = await isNotebookDirty(
      tx,
      notebookId,
      notebook.latestPublishedVersion,
      dirty,
      stagedLayout,
    );
    if (changed)
      await tx.notebook.update({
        where: { id: notebookId },
        data: { dirty: notebookDirty },
      });
    return {
      notebookId,
      documentId,
      width,
      dirty: dirty.has(documentId),
      notebookDirty,
      historyEntryId,
      blocks,
      jsonl,
    };
  });
}

export async function writeDocument(
  input: NotebookKey & {
    documentId?: string;
    label?: string;
    runKey?: string;
    width?: NotebookDocumentWidth;
  } & Parameters<typeof encodeDocument>[0],
) {
  if (input.documentId === undefined && input.label === undefined) {
    throw new InvalidRequestError(
      "Pass a label to add a document, or documentId to replace an existing one.",
    );
  }
  if (input.documentId !== undefined && input.label !== undefined) {
    throw new InvalidRequestError(
      "Labels for existing documents are set through the notebook layout.",
    );
  }
  const newDocumentLabel =
    input.label === undefined
      ? undefined
      : notebookDocumentLabel.parse(input.label);
  const width = notebookDocumentWidth.optional().parse(input.width);
  const widthOnly =
    input.documentId !== undefined &&
    width !== undefined &&
    input.markdown === undefined &&
    input.blocks === undefined &&
    input.jsonl === undefined;
  const target = {
    projectId: input.projectId,
    notebookId: input.notebookId,
    documentId: input.documentId ?? randomUUID(),
    runKey: input.runKey,
  };
  if (widthOnly) return saveEdit(target, { kind: "resize", width });
  const body = encodeDocument(input);
  if (newDocumentLabel !== undefined) {
    return saveEdit(target, {
      kind: "add",
      title: newDocumentLabel,
      body,
      width,
    });
  }
  return saveEdit(target, { kind: "replace", body, width });
}

export async function patchDocument(
  input: NotebookKey & {
    documentId?: string;
    runKey?: string;
    operations: Parameters<typeof applyDocumentPatch>[1];
  },
) {
  return saveEdit(
    {
      projectId: input.projectId,
      notebookId: input.notebookId,
      documentId: input.documentId ?? MAIN_NOTEBOOK_DOCUMENT,
      runKey: input.runKey,
    },
    { kind: "patch", operations: input.operations },
  );
}

export async function updateNotebookLayout(
  input: NotebookKey & { layout: NotebookLayout },
) {
  const { projectId, notebookId } = input;
  const layout = notebookLayoutSchema.parse(input.layout);
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const notebook = await getNotebookRow(tx, input);
    await tx.notebookVersion.update({
      where: { notebookId_number: { notebookId, number: STAGED } },
      data: { layout },
    });
    const { dirty } = await readIndexes(
      tx,
      notebookId,
      notebook.latestPublishedVersion,
    );
    const notebookDirty = await isNotebookDirty(
      tx,
      notebookId,
      notebook.latestPublishedVersion,
      dirty,
      layout,
    );
    await tx.notebook.update({
      where: { id: notebookId },
      data: { dirty: notebookDirty },
    });
    return { notebookId, layout, notebookDirty };
  });
}
