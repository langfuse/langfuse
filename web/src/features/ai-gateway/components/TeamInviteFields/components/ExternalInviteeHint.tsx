import { Mail } from "@langfuse/icons";

export type ExternalInviteeHintProps = {
  count: number;
};

export function ExternalInviteeHint({ count }: ExternalInviteeHintProps) {
  const subject = count === 1 ? "1 person isn't" : `${count} people aren't`;

  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      {/* One line tall, so a wrapping hint keeps the icon on its first line;
          nudged down to the lowercase text's middle rather than the line box's. */}
      <span className="flex h-4 shrink-0 translate-y-px items-center">
        <Mail size="sm" color="tertiary" aria-hidden />
      </span>
      <span>
        {subject} in the organization yet. They&apos;ll be invited to the
        organization and join with the{" "}
        <strong className="text-foreground font-bold">AI Gateway</strong> role.
      </span>
    </p>
  );
}
