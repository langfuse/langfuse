import { Callout } from "@/src/components/design-system/Callout/Callout";

export type LandingNotice = "welcome" | "last-project-unavailable";

const messages: Record<
  LandingNotice,
  { variant: "info" | "warning"; title: string; body: string }
> = {
  welcome: {
    variant: "info",
    title: "Welcome to Langfuse",
    body: "Pick a project to start. From then on, Langfuse opens the project you used last.",
  },
  "last-project-unavailable": {
    variant: "warning",
    title: "Your last project is no longer available",
    body: "It may have been deleted, or your access changed. Pick another project to continue.",
  },
};

/** Explains why `/` opened the overview instead of a project. */
export function LandingNoticeCallout({
  notice,
  onDismiss,
}: {
  notice: LandingNotice;
  onDismiss: () => void;
}) {
  const message = messages[notice];
  return (
    <Callout
      variant={message.variant}
      align="top"
      actions={[]}
      onDismiss={onDismiss}
    >
      <div className="flex flex-col gap-0.5">
        <p className="font-bold">{message.title}</p>
        <p className="text-muted-foreground">{message.body}</p>
      </div>
    </Callout>
  );
}
