import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  buildNotebookPath,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma, type Prisma } from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";
import { ZodError } from "zod";
import { resolveNotebookPort } from "../ports";
import {
  MAIN_NOTEBOOK_DOCUMENT,
  MAX_NOTEBOOK_DOCUMENTS,
  notebookDocumentLabel,
  notebookDocumentWidth,
  notebookLayoutKind,
  notebookLayoutSchema,
  storedNotebookConfigSchema,
  type NotebookConfig,
  type NotebookWiring,
  type NotebookDocumentWidth,
  type NotebookLayout,
} from "../schema";
import { applyDocumentPatch } from "./fns/applyDocumentPatch";
import { validateNotebookDocuments } from "./fns/validateNotebookDocuments";
import { encodeDocument } from "./fns/encodeDocument";
import { getDirtyDocumentIds } from "./fns/getDirtyDocumentIds";
import { getNotebookLayoutDocumentIds } from "./fns/getNotebookLayoutDocumentIds";
import { parseDocument } from "./fns/parseDocument";

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
  return buildNotebookPath({ projectId, notebookId, documentId, version });
}
type Db = Prisma.TransactionClient;
type EditTarget = NotebookKey & { documentId: string; userId?: string };

async function getNotebookRow(db: Db, { projectId, notebookId }: NotebookKey) {
  const notebook = await db.notebook.findUnique({
    where: { id_projectId: { id: notebookId, projectId } },
  });
  if (!notebook) throw new LangfuseNotFoundError("Notebook not found.");
  return notebook;
}

async function lockProject(tx: Db, projectId: string) {
  await tx.$queryRaw`
    SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`notebooks:${projectId}`}, 0))
  `;
}

async function getPublishedRevision(
  db: Db,
  notebookId: string,
  number: number,
) {
  const publication = await db.notebookPublication.findUnique({
    where: { notebookId_number: { notebookId, number } },
  });
  if (!publication)
    throw new LangfuseNotFoundError("Notebook version not found.");
  return publication.revision;
}

async function findDocumentIndex(db: Db, notebookId: string, version: number) {
  return db.notebookVersionDocument.findMany({
    where: { notebookId, version },
    select: documentIndexSelect,
    orderBy: { documentId: "asc" },
  });
}

async function readNotebookConfig(db: Db, notebookId: string, number: number) {
  const snapshot = await db.notebookVersion.findUnique({
    where: { notebookId_number: { notebookId, number } },
    select: { layout: true },
  });
  if (!snapshot) throw new LangfuseNotFoundError("Notebook version not found.");
  return storedNotebookConfigSchema.parse(snapshot.layout);
}

async function isNotebookDirty(
  db: Db,
  notebookId: string,
  latestPublishedVersion: number | null,
  dirtyDocuments: ReadonlySet<string>,
  stagedConfig: NotebookConfig,
) {
  if (!latestPublishedVersion || dirtyDocuments.size > 0) return true;
  const publishedConfig = await readNotebookConfig(
    db,
    notebookId,
    await getPublishedRevision(db, notebookId, latestPublishedVersion),
  );
  return !isDeepStrictEqual(stagedConfig, publishedConfig);
}

async function readIndexes(
  db: Db,
  notebook: Pick<
    Awaited<ReturnType<typeof getNotebookRow>>,
    "id" | "draftRevision" | "latestPublishedVersion"
  >,
) {
  const { id: notebookId, draftRevision, latestPublishedVersion } = notebook;
  const [staged, published] = await Promise.all([
    findDocumentIndex(db, notebookId, draftRevision),
    latestPublishedVersion
      ? getPublishedRevision(db, notebookId, latestPublishedVersion).then(
          (revision) => findDocumentIndex(db, notebookId, revision),
        )
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

export async function getNotebook(
  input: NotebookKey & { version?: number; preferStaged?: boolean },
) {
  return prisma.$transaction(
    async (tx) => {
      const notebook = await getNotebookRow(tx, input);
      const version =
        input.version ??
        (input.preferStaged && notebook.dirty
          ? null
          : notebook.latestPublishedVersion);
      const { staged, published, dirty } = await readIndexes(tx, notebook);
      const snapshots = await tx.notebookPublication.findMany({
        where: { notebookId: notebook.id },
        select: { number: true, publishedAt: true, revision: true },
        orderBy: { number: "desc" },
      });
      const snapshot = snapshots.find(({ number }) => number === version);
      const revisions = await tx.notebookVersion.findMany({
        where: { notebookId: notebook.id },
        select: { number: true },
        orderBy: { number: "desc" },
      });
      if (version && !snapshot)
        throw new LangfuseNotFoundError("Notebook version not found.");
      let index = published;
      if (version === null) {
        index = staged;
      } else if (snapshot && version !== notebook.latestPublishedVersion) {
        index = await findDocumentIndex(tx, notebook.id, snapshot.revision);
      }
      const stagedConfig = await readNotebookConfig(
        tx,
        notebook.id,
        notebook.draftRevision,
      );
      const config = snapshot
        ? await readNotebookConfig(tx, notebook.id, snapshot.revision)
        : stagedConfig;
      const { layout } = config;
      const reachableIds = new Set(getNotebookLayoutDocumentIds(layout));
      return {
        notebookId: notebook.id,
        title: notebook.title,
        version,
        publishedAt: snapshot?.publishedAt ?? null,
        latestPublishedVersion: notebook.latestPublishedVersion,
        versions: snapshots.map(({ number }) => number),
        draftRevision: notebook.draftRevision,
        revisions: revisions.map(({ number }) => number),
        dirty: notebook.dirty,
        ...config,
        stagedLayout: stagedConfig.layout,
        stagedVariables: stagedConfig.variables,
        stagedBindings: stagedConfig.bindings,
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
  const notebook = await prisma.$transaction(async (tx) => {
    const notebook = await tx.notebook.create({
      data: { projectId: input.projectId, title: input.title },
    });
    await tx.notebookDocumentBody.create({
      data: { notebookId: notebook.id, hash: EMPTY_HASH, jsonl: "" },
    });
    await tx.notebookVersion.create({
      data: {
        notebookId: notebook.id,
        number: 1,
        layout,
        documents: {
          createMany: {
            data: [
              { documentId: MAIN_NOTEBOOK_DOCUMENT, contentHash: EMPTY_HASH },
            ],
          },
        },
      },
    });
    return notebook;
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
      documents: {
        where: { documentId },
        orderBy: { documentId: "asc" },
        include: { body: true },
      },
    },
  });
  if (!candidate)
    throw new LangfuseNotFoundError("Notebook version not found.");
  if (documentId && !candidate.documents.length)
    throw new LangfuseNotFoundError("Document not found.");
  return {
    documents: candidate.documents.map(({ body, ...document }) => ({
      ...document,
      jsonl: body.jsonl,
    })),
    ...storedNotebookConfigSchema.parse(candidate.layout),
  };
}

function getSnapshotFingerprint(
  revision: number,
  candidate: Awaited<ReturnType<typeof findCandidate>>,
) {
  return createHash("sha256")
    .update(JSON.stringify({ revision, ...candidate }))
    .digest("hex");
}

export async function validateNotebook(
  input: NotebookKey & { documentId?: string; sourceVersion?: number },
) {
  return prisma.$transaction(
    async (tx) => {
      const notebook = await getNotebookRow(tx, input);
      const revision =
        input.sourceVersion === undefined
          ? notebook.draftRevision
          : await getPublishedRevision(tx, notebook.id, input.sourceVersion);
      const candidate = await findCandidate(
        tx,
        notebook.id,
        revision,
        input.documentId,
      );
      const { documents, ...config } = candidate;
      const { errors, warnings } = validateNotebookDocuments(
        documents,
        config.layout,
        input.documentId === undefined,
        config,
      );
      const { dirty } = await readIndexes(tx, notebook);
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        revision,
        snapshotFingerprint:
          input.documentId === undefined
            ? getSnapshotFingerprint(revision, candidate)
            : null,
        sourceVersion: input.sourceVersion ?? null,
        dirty: input.documentId ? dirty.has(input.documentId) : notebook.dirty,
        checkedDocumentIds: documents.map(({ documentId }) => documentId),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function publishNotebook(
  input: NotebookKey & {
    sourceVersion?: number;
    sourceRevision?: number;
    expectedSnapshotFingerprint?: string;
  },
) {
  if (input.sourceVersion !== undefined && input.sourceRevision !== undefined) {
    throw new InvalidRequestError("Choose a source version or revision.");
  }
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, input.projectId);
    const notebook = await getNotebookRow(tx, input);
    const revision =
      input.sourceVersion === undefined
        ? (input.sourceRevision ?? notebook.draftRevision)
        : await getPublishedRevision(tx, notebook.id, input.sourceVersion);
    const candidate = await findCandidate(tx, notebook.id, revision);
    if (
      input.expectedSnapshotFingerprint !== undefined &&
      input.expectedSnapshotFingerprint !==
        getSnapshotFingerprint(revision, candidate)
    ) {
      throw new InvalidRequestError(
        "The notebook snapshot changed. Review it again before publishing.",
      );
    }
    const { documents, ...config } = candidate;
    const { errors } = validateNotebookDocuments(
      documents,
      config.layout,
      true,
      config,
    );
    if (errors.length) {
      throw new InvalidRequestError(
        errors
          .map(({ documentId, message }) =>
            documentId ? `${documentId}: ${message}` : message,
          )
          .join("\n"),
      );
    }
    await tx.notebookVersion.updateMany({
      where: {
        notebookId: notebook.id,
        number: notebook.draftRevision,
        editedAt: { not: null },
      },
      data: { editedAt: null },
    });
    if (
      input.sourceVersion === undefined &&
      input.sourceRevision === undefined &&
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
    await tx.notebookPublication.create({
      data: {
        notebookId: notebook.id,
        number: version,
        revision,
      },
    });
    const staged = await findDocumentIndex(
      tx,
      notebook.id,
      notebook.draftRevision,
    );
    const stagedConfig = await readNotebookConfig(
      tx,
      notebook.id,
      notebook.draftRevision,
    );
    const dirty =
      getDirtyDocumentIds(staged, documents).size > 0 ||
      !isDeepStrictEqual(stagedConfig, config);
    await tx.notebook.update({
      where: { id: notebook.id },
      data: { latestPublishedVersion: version, dirty },
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
  revision?: number;
  staged?: boolean;
  preferStaged?: boolean;
  respectLayout?: boolean;
  includeVariableChoices?: boolean;
};

export async function readDocument(input: ReadTarget) {
  if (
    (input.staged &&
      (input.version !== undefined || input.revision !== undefined)) ||
    (input.version !== undefined && input.revision !== undefined)
  ) {
    throw new InvalidRequestError(
      "Choose a draft, published version, or revision.",
    );
  }
  const resolve = async (tx: Db) => {
    const notebook = await getNotebookRow(tx, input);
    const useDraft =
      input.staged === true ||
      (input.revision === undefined &&
        input.version === undefined &&
        input.preferStaged === true &&
        (notebook.dirty || notebook.latestPublishedVersion === null));
    const version =
      useDraft || input.revision !== undefined
        ? null
        : (input.version ?? notebook.latestPublishedVersion);
    if (!useDraft && version === null && input.revision === undefined)
      throw new LangfuseNotFoundError(
        "Notebook has not been published. Read the staged document instead.",
      );
    const revision =
      input.revision ??
      (version === null
        ? notebook.draftRevision
        : await getPublishedRevision(tx, notebook.id, version));
    const { staged, published, dirty } = await readIndexes(tx, notebook);
    const index = await (async () => {
      if (useDraft) return staged;
      if (version !== null && version === notebook.latestPublishedVersion)
        return published;
      return findDocumentIndex(tx, notebook.id, revision);
    })();
    const config = await readNotebookConfig(tx, notebook.id, revision);
    const { layout, bindings } = config;
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
          version: revision,
          documentId,
        },
      },
      include: { body: true },
    });
    if (!document) {
      throw new LangfuseNotFoundError(
        "Document not found in the requested version.",
      );
    }
    const versions = await tx.notebookPublication.findMany({
      where: { notebookId: notebook.id },
      select: { number: true, publishedAt: true },
      orderBy: { number: "desc" },
    });
    const blocks = parseDocument(document.body.jsonl);
    const variableChoices: {
      variableId: string;
      choices: { value: string; label: string }[];
    }[] = [];
    if (input.includeVariableChoices) {
      const writes = (bindings ?? [])
        .filter((binding) => binding.kind === "write")
        .filter(({ from }) => layoutDocumentIds.has(from.documentId));
      const sourceIds = [
        ...new Set(
          writes.flatMap(({ from }) =>
            from.documentId === documentId ? [] : [from.documentId],
          ),
        ),
      ];
      const blocksByDocument = new Map([[documentId, blocks]]);
      if (sourceIds.length > 0) {
        const sources = await tx.notebookVersionDocument.findMany({
          where: {
            notebookId: notebook.id,
            version: revision,
            documentId: { in: sourceIds },
          },
          select: { documentId: true, body: { select: { jsonl: true } } },
        });
        for (const source of sources) {
          try {
            blocksByDocument.set(
              source.documentId,
              parseDocument(source.body.jsonl),
            );
          } catch (error) {
            if (
              !(
                error instanceof InvalidRequestError ||
                error instanceof ZodError
              )
            )
              throw error;
          }
        }
      }
      for (const { from, variableId } of writes) {
        const port = resolveNotebookPort(
          blocksByDocument.get(from.documentId) ?? [],
          from,
        );
        if (port?.direction === "output") {
          variableChoices.push({ variableId, choices: port.choices });
        }
      }
    }
    const linkVersion = input.preferStaged ? (input.version ?? null) : version;
    return {
      projectId: notebook.projectId,
      notebookId: notebook.id,
      title: notebook.title,
      updatedAt: notebook.updatedAt,
      ...config,
      documentId,
      width: document.width,
      version,
      revision,
      dirty: dirty.has(documentId),
      notebookDirty: notebook.dirty,
      isDraft: useDraft,
      url:
        input.revision === undefined
          ? getDocumentUrl(input, documentId, linkVersion, layoutDocumentIds)
          : null,
      documents: index.map(({ documentId }) => ({
        id: documentId,
        url:
          input.revision === undefined
            ? getDocumentUrl(input, documentId, linkVersion, layoutDocumentIds)
            : null,
      })),
      versions: versions.flatMap(({ number, publishedAt }) =>
        publishedAt ? [{ number, publishedAt }] : [],
      ),
      blocks,
      ...(input.includeVariableChoices ? { variableChoices } : {}),
      jsonl: document.body.jsonl,
    };
  };

  return prisma.$transaction(resolve, { isolationLevel: "RepeatableRead" });
}

async function editRevision(
  tx: Db,
  notebook: Pick<
    Awaited<ReturnType<typeof getNotebookRow>>,
    "id" | "draftRevision"
  >,
  config: NotebookConfig,
  userId: string | undefined,
) {
  const { id: notebookId, draftRevision } = notebook;
  const key = { notebookId_number: { notebookId, number: draftRevision } };
  const head = await tx.notebookVersion.findUniqueOrThrow({ where: key });
  const now = new Date();
  if (
    userId &&
    head.authorId === userId &&
    head.editedAt &&
    now.getTime() - head.editedAt.getTime() < EDIT_IDLE_MS
  ) {
    await tx.notebookVersion.update({
      where: key,
      data: { layout: config, editedAt: now },
    });
    return draftRevision;
  }
  const number = draftRevision + 1;
  const documents = await findDocumentIndex(tx, notebookId, draftRevision);
  await tx.notebookVersion.create({
    data: {
      notebookId,
      number,
      layout: config,
      authorId: userId,
      editedAt: userId ? now : null,
      documents: { createMany: { data: documents } },
    },
  });
  await tx.notebook.update({
    where: { id: notebookId },
    data: { draftRevision: number },
  });
  return number;
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
  const { notebookId, documentId, userId } = target;
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, target.projectId);
    const notebook = await getNotebookRow(tx, target);
    const where = {
      notebookId_version_documentId: {
        notebookId,
        version: notebook.draftRevision,
        documentId,
      },
    };
    const staged = await tx.notebookVersionDocument.findUnique({
      where,
      include: { body: true },
    });
    const config = await readNotebookConfig(
      tx,
      notebookId,
      notebook.draftRevision,
    );
    const { layout } = config;
    let stagedLayout = layout;
    if (command.kind === "add") {
      if (layout.kind === "default") {
        throw new InvalidRequestError(
          "Only Inbox and Tabs layouts can add documents.",
        );
      }
      const count = await tx.notebookVersionDocument.count({
        where: { notebookId, version: notebook.draftRevision },
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
    } else {
      if (!staged)
        throw new LangfuseNotFoundError(
          "Staged document not found. Add it through Inbox or Tabs first.",
        );
    }
    const previous = staged?.body.jsonl ?? "";
    const { blocks, jsonl } = (() => {
      if (command.kind === "patch")
        return applyDocumentPatch(previous, command.operations);
      if (command.kind === "resize")
        return { blocks: parseDocument(previous), jsonl: previous };
      return command.body;
    })();
    const width = command.width ?? staged?.width ?? "contained";
    const contentChanged = !staged || previous !== jsonl;
    const changed = contentChanged || staged.width !== width;
    let revision = notebook.draftRevision;
    const stagedConfig = { ...config, layout: stagedLayout };
    if (changed) {
      revision = await editRevision(tx, notebook, stagedConfig, userId);
      const contentHash = contentChanged
        ? createHash("sha256").update(jsonl).digest("hex")
        : staged.contentHash;
      if (contentChanged) {
        await tx.notebookDocumentBody.createMany({
          data: [{ notebookId, hash: contentHash, jsonl }],
          skipDuplicates: true,
        });
      }
      const data = { contentHash, width };
      await tx.notebookVersionDocument.upsert({
        where: {
          notebookId_version_documentId: {
            notebookId,
            documentId,
            version: revision,
          },
        },
        update: data,
        create: { ...data, notebookId, documentId, version: revision },
      });
      if (staged && revision === notebook.draftRevision && contentChanged) {
        await tx.notebookDocumentBody.deleteMany({
          where: {
            notebookId,
            hash: staged.contentHash,
            documents: { none: {} },
          },
        });
      }
    }
    const { dirty } = await readIndexes(tx, {
      ...notebook,
      draftRevision: revision,
    });
    const notebookDirty = await isNotebookDirty(
      tx,
      notebookId,
      notebook.latestPublishedVersion,
      dirty,
      stagedConfig,
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
      revision,
      blocks,
      jsonl,
    };
  });
}

export async function writeDocument(
  input: NotebookKey & {
    documentId?: string;
    label?: string;
    userId?: string;
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
    userId: input.userId,
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
    userId?: string;
    operations: Parameters<typeof applyDocumentPatch>[1];
  },
) {
  return saveEdit(
    {
      projectId: input.projectId,
      notebookId: input.notebookId,
      documentId: input.documentId ?? MAIN_NOTEBOOK_DOCUMENT,
      userId: input.userId,
    },
    { kind: "patch", operations: input.operations },
  );
}

export async function updateNotebookLayout(
  input: NotebookKey &
    NotebookWiring & { layout?: NotebookLayout; userId?: string },
) {
  const { projectId, notebookId } = input;
  const nextLayout =
    input.layout === undefined
      ? undefined
      : notebookLayoutSchema.parse(input.layout);
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const notebook = await getNotebookRow(tx, input);
    const previous = await readNotebookConfig(
      tx,
      notebookId,
      notebook.draftRevision,
    );
    const { variables, bindings, ...layout }: NotebookLayout =
      nextLayout ?? previous.layout;
    const config = storedNotebookConfigSchema.parse({
      layout,
      variables: input.variables ?? variables ?? previous.variables,
      bindings: input.bindings ?? bindings ?? previous.bindings,
    });
    if (isDeepStrictEqual(previous, config)) {
      return {
        notebookId,
        ...config,
        notebookDirty: notebook.dirty,
        revision: notebook.draftRevision,
      };
    }
    const revision = await editRevision(tx, notebook, config, input.userId);
    const { dirty } = await readIndexes(tx, {
      ...notebook,
      draftRevision: revision,
    });
    const notebookDirty = await isNotebookDirty(
      tx,
      notebookId,
      notebook.latestPublishedVersion,
      dirty,
      config,
    );
    await tx.notebook.update({
      where: { id: notebookId },
      data: { dirty: notebookDirty },
    });
    return { notebookId, ...config, notebookDirty, revision };
  });
}
