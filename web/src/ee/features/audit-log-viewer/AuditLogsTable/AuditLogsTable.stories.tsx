import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { AuditLogsTable, type AuditLogRow } from "./AuditLogsTable";

const meta = preview.meta({ component: AuditLogsTable });

const rows = [
  {
    id: "audit-log-1",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    updatedAt: new Date("2026-09-01T12:00:00Z"),
    type: "USER",
    apiKeyId: null,
    userId: "user-1",
    orgId: "org-1",
    userOrgRole: "ADMIN",
    projectId: "project-1",
    userProjectRole: null,
    resourceType: "project",
    resourceId: "project-1",
    action: "update",
    before: JSON.stringify({
      name: "Old name",
      settings: {
        environment: "production",
        retention: "30 days",
        description: "Previous configuration for this project",
        notifications: { email: true, slack: false, webhook: false },
        access: { defaultRole: "viewer", allowedDomains: ["example.com"] },
      },
    }),
    after: JSON.stringify({
      name: "New name",
      settings: {
        environment: "production",
        retention: "90 days",
        description: "Updated configuration for this project",
        notifications: { email: true, slack: true, webhook: true },
        access: {
          defaultRole: "editor",
          allowedDomains: ["example.com", "langfuse.com"],
        },
      },
    }),
    actor: {
      type: "USER",
      body: {
        id: "user-1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: null,
      },
    },
  },
  {
    id: "audit-log-2",
    createdAt: new Date("2026-09-02T12:00:00Z"),
    updatedAt: new Date("2026-09-02T12:00:00Z"),
    type: "API_KEY",
    apiKeyId: "api-key-1",
    userId: null,
    orgId: "org-1",
    userOrgRole: null,
    projectId: "project-1",
    userProjectRole: null,
    resourceType: "prompt",
    resourceId: "prompt-1",
    action: "create",
    before: null,
    after: '{"name":"New prompt"}',
    actor: {
      type: "API_KEY",
      body: { id: "api-key-1", publicKey: "pk-example" },
    },
  },
] satisfies AuditLogRow[];

export const Default = meta.story({
  args: {
    tableName: "auditLogs",
    data: { status: "success", data: rows },
    pagination: {
      mode: "offset",
      totalCount: rows.length,
      state: { pageIndex: 0, pageSize: 50 },
      onChange: fn(),
    },
    rowHeight: "s",
    onRowHeightChange: fn(),
  },
  render: (args) => {
    const [rowHeight, setRowHeight] = useState(args.rowHeight);

    return (
      <AuditLogsTable
        {...args}
        rowHeight={rowHeight}
        onRowHeightChange={(height) => {
          setRowHeight(height);
          args.onRowHeightChange(height);
        }}
      />
    );
  },
});

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    data: { status: "loading" },
  },
});
