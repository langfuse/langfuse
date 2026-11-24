import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { AccessDialog } from "./AccessDialog";

type AccessDialogProps = Parameters<typeof AccessDialog>[0];

/** Opens the dialog from a button, the way the role cells do. */
function AccessDialogDemo(props: AccessDialogProps) {
  return (
    <DialogController renderDialog={() => <AccessDialog {...props} />}>
      {({ openDialog }) => (
        <Button onClick={() => openDialog()} text="Open access dialog" />
      )}
    </DialogController>
  );
}

const meta = preview.meta({
  component: AccessDialogDemo,
  parameters: { layout: "centered" },
});

const body = (
  <p className="text-muted-foreground">
    The role, where it comes from and who it reaches go here.
  </p>
);

export const ForAPerson = meta.story({
  args: {
    level: "organization",
    subject: "priya.raman@northwind.example",
    isSaveDisabled: true,
    onSave: fn(),
    children: body,
  },
});

export const ForAGroup = meta.story({
  args: {
    level: "organization",
    subject: (
      <>
        <span className="text-link">Customer Support</span> · 3 members
      </>
    ),
    isSaveDisabled: false,
    onSave: fn(),
    children: body,
  },
});

export const OnAProject = meta.story({
  args: {
    level: "project",
    projectName: "llm-app",
    projectHref: "/project/project-1",
    subject: "aiko.tanaka@northwind.example",
    isSaveDisabled: true,
    onSave: fn(),
    children: body,
  },
});

export const LongProjectName = meta.story({
  args: {
    ...OnAProject.input.args,
    projectName: "customer-support-assistant-production-europe-west",
  },
});
