const CLICKHOUSE_STAFF_EMAIL_DOMAIN = "@clickhouse.com";

/**
 * Real org and project memberships from the session. Admins who are not
 * members have no entry here; staff access to those resources is granted in
 * the tRPC project and organization middleware.
 */
type CustomerDataWarningMembership = {
  id: string;
  projects: { id: string }[];
};

export type CustomerDataWarning =
  | {
      scope: "project";
      organizationName: string;
      projectName: string;
    }
  | {
      scope: "organization";
      organizationName: string;
    };

type CustomerDataWarningInput = {
  email: string | null | undefined;
  isAdmin: boolean;
  isLangfuseCloud: boolean;
  projectId: string | null;
  organizationId: string | null;
  memberships: CustomerDataWarningMembership[];
  organizationName: string | null;
  projectName: string | null;
};

function isClickHouseStaffEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase().endsWith(CLICKHOUSE_STAFF_EMAIL_DOMAIN) === true;
}

function isProjectMember(
  memberships: CustomerDataWarningMembership[],
  projectId: string,
): boolean {
  return memberships.some((organization) =>
    organization.projects.some((project) => project.id === projectId),
  );
}

function isOrganizationMember(
  memberships: CustomerDataWarningMembership[],
  organizationId: string,
): boolean {
  return memberships.some((organization) => organization.id === organizationId);
}

/**
 * Confidentiality strip for ClickHouse staff on Langfuse Cloud.
 *
 * Shown when the signed-in user is a ClickHouse admin viewing a project or
 * organization through staff access: the deployment has a Cloud region, the
 * email domain is @clickhouse.com, `users.admin` is set, and the current
 * project or organization is absent from their session memberships. Genuine
 * members, other email domains, and self-hosted deployments are excluded.
 * Names come from the resolved project or organization and are required, so
 * the strip stays hidden while that lookup is still in flight.
 */
export function getCustomerDataWarning(
  input: CustomerDataWarningInput,
): CustomerDataWarning | null {
  if (!input.isLangfuseCloud || !input.isAdmin) return null;
  if (!isClickHouseStaffEmail(input.email)) return null;

  if (input.projectId) {
    if (isProjectMember(input.memberships, input.projectId)) return null;
    if (!input.organizationName || !input.projectName) return null;
    return {
      scope: "project",
      organizationName: input.organizationName,
      projectName: input.projectName,
    };
  }

  if (input.organizationId) {
    if (isOrganizationMember(input.memberships, input.organizationId))
      return null;
    if (!input.organizationName) return null;
    return {
      scope: "organization",
      organizationName: input.organizationName,
    };
  }

  return null;
}

export function customerDataWarningText(warning: CustomerDataWarning): string {
  const target =
    warning.scope === "project"
      ? `customer project (${warning.organizationName} / ${warning.projectName})`
      : `customer organization (${warning.organizationName})`;

  return `You are viewing a ${target}. Treat all data as confidential; you can edit and delete customer data.`;
}
