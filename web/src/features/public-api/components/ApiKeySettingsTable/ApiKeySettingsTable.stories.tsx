import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { ApiKeySettingsTable } from "./ApiKeySettingsTable";

const meta = preview.meta({ component: ApiKeySettingsTable });

const apiKey = {
  id: "key-1",
  createdAt: new Date("2026-09-01"),
  expiresAt: null,
  lastUsedAt: null,
  note: "Production key",
  publicKey: "pk-lf-1234",
  displaySecretKey: "sk-lf-...5678",
  createdByUser: {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: "https://i.pravatar.cc/150?u=ada@example.com",
  },
  createdByApiKey: null,
};

export const Default = meta.story({
  args: {
    editNameAction: { hasAccess: true, onClick: fn() },
    hasWriteAccess: true,
    onDelete: fn(),
    search: { value: "", onChange: fn() },
    data: {
      status: "success",
      data: [
        apiKey,
        {
          ...apiKey,
          id: "key-2",
          note: "Expired key",
          expiresAt: new Date("2020-01-01T12:00:00Z"),
        },
        {
          ...apiKey,
          id: "key-3",
          note: "Future expiration",
          expiresAt: new Date("2099-01-01T12:00:00Z"),
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    editNameAction: { hasAccess: true, onClick: fn() },
    hasWriteAccess: true,
    onDelete: fn(),
    search: { value: "", onChange: fn() },
    data: { status: "loading" },
    loadingRowCount: 5,
  },
});

export const WithGatewayKeyFilter = meta.story({
  args: {
    ...Default.input.args,
    gatewayKeyFilter: {
      includeGatewayKeys: false,
      onIncludeGatewayKeysChange: fn(),
    },
  },
});

export const WithPermissions = meta.story({
  args: {
    ...Default.input.args,
    permissionsAction: { scope: "project", onClick: fn() },
    data: {
      status: "success",
      data: [
        {
          ...apiKey,
          id: "key-1",
          note: "Terraform",
          role: "LEGACY_PROJECT_API_KEY",
        },
        { ...apiKey, id: "key-2", note: "CI pipeline", role: "INGEST" },
        { ...apiKey, id: "key-3", note: "Dashboard sync", role: "VIEWER" },
        { ...apiKey, id: "key-4", note: "Eval runner", role: "ADMIN" },
        { ...apiKey, id: "key-5", note: "Notebook", role: "MEMBER" },
        { ...apiKey, id: "key-6", note: "Web app", role: "APPLICATION" },
      ],
    },
  },
});
