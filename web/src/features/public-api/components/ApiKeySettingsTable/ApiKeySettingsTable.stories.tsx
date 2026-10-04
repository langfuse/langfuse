import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { ApiKeySettingsTable } from "./ApiKeySettingsTable";

const meta = preview.meta({ component: ApiKeySettingsTable });

export const Default = meta.story({
  args: {
    editNoteAction: { hasAccess: true, onClick: fn() },
    hasWriteAccess: true,
    onDelete: fn(),
    data: {
      status: "success",
      data: [
        {
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
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    editNoteAction: { hasAccess: true, onClick: fn() },
    hasWriteAccess: true,
    onDelete: fn(),
    data: { status: "loading" },
    loadingRowCount: 5,
  },
});
