import { Banner } from "@/src/components/design-system/Banner/Banner";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";

export type TeamInviteFailuresAlertProps = {
  failures: TeamInviteFailure[];
};

export function TeamInviteFailuresAlert({
  failures,
}: TeamInviteFailuresAlertProps) {
  return (
    <Banner variant="error" title="Some invitations were not sent">
      <ul className="ph-no-capture">
        {failures.map((failure) => (
          <li key={failure.email}>
            {failure.email}: {failure.message}
          </li>
        ))}
      </ul>
    </Banner>
  );
}
