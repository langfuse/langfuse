import { type ComponentProps } from "react";
import { fn, userEvent, within } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { SsoConfigDialogController } from "./SsoConfigDialogController";

const meta = preview.meta({
  component: SsoConfigDialogController,
  args: {
    isSaving: false,
    onSave:
      fn<
        ComponentProps<typeof SsoConfigDialogController>["onSave"]
      >().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open SSO configuration",
      }),
    );
  },
});

export const Configure = meta.story({
  args: {
    children: ({ openDialog }) => (
      <Button
        text="Open SSO configuration"
        onClick={() => openDialog({ domain: "example.com", config: null })}
      />
    ),
  },
});

export const Edit = meta.story({
  args: {
    children: ({ openDialog }) => (
      <Button
        text="Open SSO configuration"
        onClick={() =>
          openDialog({
            domain: "company.com",
            config: {
              domain: "company.com",
              authProvider: "okta",
              authConfig: {
                clientId: "example-client-id",
                issuer: "https://company.okta.com",
              },
              createdAt: new Date("2026-09-01"),
              updatedAt: new Date("2026-09-20"),
            },
          })
        }
      />
    ),
  },
});
