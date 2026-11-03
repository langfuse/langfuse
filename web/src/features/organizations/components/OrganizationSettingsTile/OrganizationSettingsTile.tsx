import {
  BookOpen,
  KeyRound,
  PlusIcon,
  Settings,
  Waypoints,
} from "@langfuse/icons";

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
import { createProjectRoute } from "@/src/features/setup/setupRoutes";

export type OrganizationSettingsTileState =
  | "noProjects"
  | "noProjectAccess"
  | "gatewayLoading"
  | "gatewaySetupPending"
  | "gatewayNoKey"
  | "gatewayHasKey";

export type OrganizationSettingsTileProps = {
  orgId: string;
  orgName: string;
  state: OrganizationSettingsTileState;
};

/** OrganizationSettingsTile shows a member without projects their next step in the org */
export function OrganizationSettingsTile({
  orgId,
  orgName,
  state,
}: OrganizationSettingsTileProps) {
  const actions = tileActions(state, orgId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isGatewayState(state) && (
            <Waypoints size="base" color="default" aria-hidden="true" />
          )}
          {isGatewayState(state) ? "AI Gateway" : "No projects"}
        </CardTitle>
        <CardDescription>
          {state === "gatewayLoading" ? (
            <Skeleton className="h-5 w-2/3" />
          ) : (
            tileDescription(state, orgName)
          )}
        </CardDescription>
      </CardHeader>
      {actions !== null && <CardFooter className="gap-2">{actions}</CardFooter>}
    </Card>
  );
}

function isGatewayState(state: OrganizationSettingsTileState) {
  return state.startsWith("gateway");
}

function tileDescription(
  state: Exclude<OrganizationSettingsTileState, "gatewayLoading">,
  orgName: string,
) {
  switch (state) {
    case "noProjects":
      return "This organization has no projects yet.";
    case "noProjectAccess":
      return "You don't have access to any projects in this organization.";
    case "gatewaySetupPending":
      return `The AI Gateway of ${orgName} isn't ready yet. Your admin is still setting it up, so check back soon.`;
    case "gatewayNoKey":
      return `You've been invited to use the AI Gateway of ${orgName}. Create your personal gateway key to start using your team's AI models.`;
    case "gatewayHasKey":
      return `You're set up with the AI Gateway of ${orgName}. Manage your gateway keys or see which AI models you can use.`;
  }
}

function tileActions(state: OrganizationSettingsTileState, orgId: string) {
  const settingsButton = (
    <Button
      variant="secondary"
      href={`/organization/${orgId}/settings`}
      icon={Settings}
      text="Organization settings"
    />
  );
  const keysHref = `/organization/${orgId}/settings/ai-gateway-api-keys`;
  const docsButton = (
    <Button
      variant="secondary"
      href={GATEWAY_OVERVIEW_DOCS_URL}
      icon={BookOpen}
      text="What's the AI Gateway?"
    />
  );

  switch (state) {
    case "noProjects":
      return (
        <>
          <Button
            href={createProjectRoute(orgId)}
            icon={PlusIcon}
            text="New project"
          />
          {settingsButton}
        </>
      );
    case "noProjectAccess":
      return settingsButton;
    case "gatewayLoading":
      return null;
    case "gatewaySetupPending":
      return docsButton;
    case "gatewayNoKey":
      return (
        <>
          <Button href={keysHref} icon={KeyRound} text="Create gateway key" />
          {docsButton}
        </>
      );
    case "gatewayHasKey":
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
