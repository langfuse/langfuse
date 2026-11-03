import { BookOpen, KeyRound, Waypoints } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GATEWAY_OVERVIEW_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export type GatewayMemberStatus = "setupPending" | "noKey" | "hasKey";

export type GatewayMemberTileProps = {
  orgId: string;
  orgName: string;
  /** Undefined while the status loads. */
  status: GatewayMemberStatus | undefined;
};

/** GatewayMemberTile greets an AI Gateway member, who has no projects, with their next gateway step */
export function GatewayMemberTile({
  orgId,
  orgName,
  status,
}: GatewayMemberTileProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Waypoints size="base" color="default" aria-hidden="true" />
          AI Gateway
        </CardTitle>
        <CardDescription>
          {status === undefined ? (
            <Skeleton className="h-5 w-2/3" />
          ) : (
            description(status, orgName)
          )}
        </CardDescription>
      </CardHeader>
      {status !== undefined && (
        <CardFooter className="gap-2">
          <GatewayMemberActions orgId={orgId} status={status} />
        </CardFooter>
      )}
    </Card>
  );
}

function GatewayMemberActions({
  orgId,
  status,
}: {
  orgId: string;
  status: GatewayMemberStatus;
}) {
  const keysHref = `/organization/${orgId}/settings/ai-gateway-api-keys`;
  switch (status) {
    case "setupPending":
      return <GatewayDocsLink />;
    case "noKey":
      return (
        <>
          <Button
            variant="secondary"
            href={keysHref}
            icon={KeyRound}
            text="Create your gateway key"
          />
          <GatewayDocsLink />
        </>
      );
    case "hasKey":
      return (
        <>
          <Button
            variant="secondary"
            href={keysHref}
            icon={KeyRound}
            text="Manage gateway keys"
          />
          <Button
            variant="secondary"
            href={`/organization/${orgId}/settings/ai-gateway-models`}
            text="View models"
          />
        </>
      );
  }
}

function GatewayDocsLink() {
  return (
    <Button
      variant="ghost"
      href={GATEWAY_OVERVIEW_DOCS_URL}
      icon={BookOpen}
      text="What's the AI Gateway?"
    />
  );
}

function description(status: GatewayMemberStatus, orgName: string) {
  switch (status) {
    case "setupPending":
      return `The AI Gateway of ${orgName} isn't ready yet. Your admin is still setting it up, so check back soon.`;
    case "noKey":
      return `You've been invited to use the AI Gateway of ${orgName}. Create your personal gateway key to start using your team's AI models.`;
    case "hasKey":
      return `You're set up with the AI Gateway of ${orgName}. Manage your gateway keys or see which AI models you can use.`;
  }
}
