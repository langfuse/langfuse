const STAFF_EMAIL_DOMAINS = ["@clickhouse.com", "@langfuse.com"] as const;

/**
 * Real org and project memberships from the session. Admins who are not
 * members have no entry here; staff access to those resources is granted in
 * the tRPC project and organization middleware.
 */
type CustomerDataWarningMembership = {
  id: string;
  projects: { id: string }[];
  supportAccess?: boolean; // support access grant, not a real membership
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

function isStaffEmail(email: string | null | undefined): boolean {
  const normalized = email?.toLowerCase();
  if (!normalized) return false;
  return STAFF_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain));
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

export function getCustomerDataWarning(
  input: CustomerDataWarningInput,
): CustomerDataWarning | null {
  const hasSupportAccess = input.memberships.some((m) => m.supportAccess);
  if (!input.isLangfuseCloud || !(input.isAdmin || hasSupportAccess))
    return null;
  if (!isStaffEmail(input.email)) return null;
  const memberships = input.memberships.filter((m) => !m.supportAccess);

  if (input.projectId) {
    if (isProjectMember(memberships, input.projectId)) return null;
    if (!input.organizationName || !input.projectName) return null;
    return {
      scope: "project",
      organizationName: input.organizationName,
      projectName: input.projectName,
    };
  }

  if (input.organizationId) {
    if (isOrganizationMember(memberships, input.organizationId)) return null;
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

  return `You are viewing a ${target}. Treat all data as confidential.`;
}
