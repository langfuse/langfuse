import { Mail } from "@langfuse/icons";

export type ExternalInviteeHintProps = {
  count: number;
};

export function ExternalInviteeHint({ count }: ExternalInviteeHintProps) {
  const subject = count === 1 ? "1 person isn't" : `${count} people aren't`;

  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Mail size="sm" color="tertiary" aria-hidden />
      <span>
        {subject} in the organization yet. They&apos;ll be invited to the
        organization and join as{" "}
        <strong className="text-foreground font-bold">Member</strong>.
      </span>
    </p>
  );
}
