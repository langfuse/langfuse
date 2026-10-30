import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { BatchExportsTable, type BatchExportRow } from "./BatchExportsTable";

const meta = preview.meta({ component: BatchExportsTable });

const completedExport: BatchExportRow = {
  id: "export-1",
  projectId: "project-1",
  userId: "user-1",
  name: "Traces export",
  status: "COMPLETED",
  format: "CSV",
  query: {},
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-02"),
  finishedAt: new Date("2026-09-02"),
  expiresAt: new Date("2027-09-02"),
  log: null,
  isExpired: false,
  isDownloadable: true,
  user: { id: "user-1", name: "Ada Lovelace", image: null },
};

const pagination = {
  mode: "offset" as const,
  totalCount: 3,
  state: { pageIndex: 0, pageSize: 10 },
  onChange: fn(),
};
const commonArgs = {
  pagination,
  hasCancelAccess: true,
  downloadingIds: new Set<string>(),
  onDownload: fn(),
  onCancel: fn(),
};

export const Default = meta.story({
  args: {
    data: {
      status: "success",
      data: [
        completedExport,
        {
          ...completedExport,
          id: "export-2",
          name: "Pending export",
          status: "PROCESSING",
          finishedAt: null,
          expiresAt: null,
          isDownloadable: false,
        },
        {
          ...completedExport,
          id: "export-3",
          name: "Failed export",
          status: "FAILED",
          log: "Export failed",
          finishedAt: null,
          expiresAt: null,
          isDownloadable: false,
        },
      ],
    },
    ...commonArgs,
  },
});

export const Loading = meta.story({
  args: { ...commonArgs, data: { status: "loading" } },
});

export const Empty = meta.story({
  args: { ...commonArgs, data: { status: "success", data: [] } },
});

export const Error = meta.story({
  args: {
    ...commonArgs,
    data: { status: "error", error: "Unable to load exports" },
  },
});
