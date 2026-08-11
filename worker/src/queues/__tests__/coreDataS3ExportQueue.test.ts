import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { type StorageService } from "@langfuse/shared/src/server";
import {
  mapJobConfigurationToCoreDataRow,
  mapUserToCoreDataRow,
  uploadTableCoreDataJsonl,
} from "../coreDataS3ExportQueue";

const readStream = async (stream: Readable): Promise<string> => {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }

  return chunks.join("");
};

describe("mapUserToCoreDataRow", () => {
  it("derives auth methods from password and account providers", () => {
    const row = mapUserToCoreDataRow({
      id: "user-1",
      email: "user@example.com",
      password: "hashed-password",
      accounts: [
        { provider: "google" },
        { provider: "okta" },
        { provider: "google" },
      ],
    });

    expect(row).toStrictEqual({
      id: "user-1",
      email: "user@example.com",
      authMethods: ["credentials", "google", "okta"],
    });
    expect(JSON.stringify(row)).not.toContain("hashed-password");
  });

  it("returns no auth methods for users without password and accounts", () => {
    const row = mapUserToCoreDataRow({
      id: "user-2",
      password: null,
      accounts: [],
    });

    expect(row).toStrictEqual({ id: "user-2", authMethods: [] });
  });
});

describe("mapJobConfigurationToCoreDataRow", () => {
  const decimal = (value: number) => ({ toNumber: () => value });

  it("flattens the eval template and casts sampling to a number", () => {
    const row = mapJobConfigurationToCoreDataRow({
      id: "config-1",
      projectId: "project-1",
      scoreName: "toxicity",
      evalTemplateId: "template-1",
      evalTemplate: { name: "toxicity-v2" },
      sampling: decimal(0.5),
    });

    expect(row).toStrictEqual({
      id: "config-1",
      projectId: "project-1",
      scoreName: "toxicity",
      evalTemplateId: "template-1",
      evalTemplateName: "toxicity-v2",
      sampling: 0.5,
    });
    expect(JSON.stringify(row)).toContain('"sampling":0.5');
  });

  it("exports null for configurations without an eval template", () => {
    const row = mapJobConfigurationToCoreDataRow({
      id: "config-2",
      evalTemplate: null,
      sampling: decimal(1),
    });

    expect(row).toStrictEqual({
      id: "config-2",
      evalTemplateName: null,
      sampling: 1,
    });
  });
});

describe("uploadTableCoreDataJsonl", () => {
  const createS3Client = (
    uploadFileBuffered: ReturnType<typeof vi.fn>,
  ): StorageService => ({ uploadFileBuffered }) as unknown as StorageService;

  it("streams table rows in keyset pages", async () => {
    const createdAt = new Date("2026-05-14T00:00:00.000Z");
    const rows = [
      { id: "row-1", name: "first", createdAt },
      { id: "row-2", name: "second", createdAt },
      { id: "row-3", name: "third", createdAt },
    ];

    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) => {
        if (lastRow === null) return rows.slice(0, 2);
        if (lastRow.id === "row-2") return rows.slice(2);
        return [];
      },
    );

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        rows.map((row) => JSON.stringify(row)).join("\n"),
      );
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "rows",
      pageSize: 2,
      fetchPage,
    });

    // The second page is short, so pagination stops without a third fetch.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { lastRow: null, take: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { lastRow: rows[1], take: 2 });
    expect(uploadFileBuffered).toHaveBeenCalledTimes(1);
    expect(uploadFileBuffered).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "core/rows.jsonl",
        fileType: "application/x-ndjson",
        partSizeBytes: 100 * 1024 * 1024,
      }),
    );
  });

  it("stops after a full page that is followed by an empty page", async () => {
    const rows = [{ id: "row-1" }, { id: "row-2" }];

    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) =>
        lastRow === null ? rows : [],
    );

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        rows.map((row) => JSON.stringify(row)).join("\n"),
      );
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "rows",
      pageSize: 2,
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, { lastRow: rows[1], take: 2 });
  });

  it("applies mapRow to every row", async () => {
    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) =>
        lastRow === null
          ? [
              { id: "user-1", password: "secret", accounts: [] },
              {
                id: "user-2",
                password: null,
                accounts: [{ provider: "google" }],
              },
            ]
          : [],
    );

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        [
          JSON.stringify({ id: "user-1", authMethods: ["credentials"] }),
          JSON.stringify({ id: "user-2", authMethods: ["google"] }),
        ].join("\n"),
      );
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "users",
      pageSize: 2,
      fetchPage,
      mapRow: mapUserToCoreDataRow,
    });
  });

  it("uploads an empty file for tables without rows", async () => {
    const fetchPage = vi.fn(async () => []);

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe("");
    });

    await uploadTableCoreDataJsonl({
      s3Client: createS3Client(uploadFileBuffered),
      uploadPrefix: "core/",
      tableName: "empty",
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(uploadFileBuffered).toHaveBeenCalledTimes(1);
  });

  it("rethrows upload failures after logging the table context", async () => {
    const fetchPage = vi.fn(
      async ({ lastRow }: { lastRow: { id: string } | null; take: number }) =>
        lastRow === null ? [{ id: "row-1" }] : [],
    );

    const uploadFileBuffered = vi.fn(async () => {
      throw new Error("upload failed");
    });

    await expect(
      uploadTableCoreDataJsonl({
        s3Client: createS3Client(uploadFileBuffered),
        uploadPrefix: "core/",
        tableName: "rows",
        fetchPage,
      }),
    ).rejects.toThrow("upload failed");
  });
});
