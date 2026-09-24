import { fn } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { SsoConfigsTable } from "./SsoConfigsTable";

const meta = preview.meta({ component: SsoConfigsTable });

export const Default = meta.story({
  args: {
    data: [
      { domain: "example.com", config: null },
      {
        domain: "company.com",
        config: {
          domain: "company.com",
          authProvider: "okta",
          authConfig: null,
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-20"),
        },
      },
    ],
    onConfigure: fn(),
    onDelete: fn(),
  },
});
