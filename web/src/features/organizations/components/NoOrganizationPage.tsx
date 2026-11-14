import { useSession } from "next-auth/react";
import ContainerPage from "@/src/components/layouts/ContainerPage";
import { env } from "@/src/env.mjs";
import {
  findSessionOrganization,
  getSessionUserCanCreateOrganizations,
  hasSessionUser,
} from "@/src/features/rbac/new/sessionAccessors";
import { DemoOrganizationTile } from "@/src/features/organizations/components/DemoOrganizationTile";
import { GetStartedCard } from "@/src/features/organizations/components/GetStartedCard/GetStartedCard";

/** NoOrganizationPage is the app root for users without an organization of their own */
export const NoOrganizationPage = () => {
  const session = useSession();

  if (!hasSessionUser(session.data)) return "loading...";

  const hasDemoOrganization =
    findSessionOrganization(session.data, env.NEXT_PUBLIC_DEMO_ORG_ID) !==
    undefined;

  return (
    <ContainerPage headerProps={{ title: "Welcome to Langfuse" }}>
      <div className="flex flex-col gap-5">
        <GetStartedCard
          canCreateOrganizations={
            getSessionUserCanCreateOrganizations(session.data) === true
          }
        />
        {hasDemoOrganization && <DemoOrganizationTile />}
      </div>
    </ContainerPage>
  );
};
