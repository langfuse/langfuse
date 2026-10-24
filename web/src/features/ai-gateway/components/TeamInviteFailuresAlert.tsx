import { Alert } from "@/src/components/design-system/Alert/Alert";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";

export type TeamInviteFailuresAlertProps = {
  failures: TeamInviteFailure[];
};

export function TeamInviteFailuresAlert({
  failures,
}: TeamInviteFailuresAlertProps) {
  return (
    <Alert variant="destructive">
      <Alert.Title>Some invitations were not sent</Alert.Title>
      <Alert.Description>
        <ul className="ph-no-capture">
          {failures.map((failure) => (
            <li key={failure.email}>
              {failure.email}: {failure.message}
            </li>
          ))}
        </ul>
      </Alert.Description>
    </Alert>
  );
}
