import preview from "@/.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { ConnectionTestStatus } from "./ConnectionTestStatus";

/** Mirrors the dialog footer, where the status pushes the actions right. */
const meta = preview.meta({
  component: ConnectionTestStatus,
  decorators: [
    (Story) => (
      <div className="flex max-w-xl flex-col-reverse border-t p-6 sm:flex-row sm:justify-end sm:space-x-2">
        <Story />
        <Button variant="secondary" text="Test again" />
        <Button text="Test and save" />
      </div>
    ),
  ],
});

export const Testing = meta.story({ args: { status: "pending" } });

export const Successful = meta.story({ args: { status: "success" } });

export const Failed = meta.story({ args: { status: "error" } });
