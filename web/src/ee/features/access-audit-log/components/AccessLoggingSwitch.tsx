import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";

const descriptions = {
  org: "Record an audit event whenever a user or API key reads traces, observations, or scores in this organization.",
  enforced:
    "Your instance administrator has turned on access logging for every organization.",
  disabled: "Your instance administrator has turned off access logging.",
} as const;

export function AccessLoggingSwitch(props: { orgId: string }) {
  const { data: session, update: updateSession } = useSession();
  const utils = api.useUtils();
  const organization = useQueryOrganization();
  const hasAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "organization:update",
  });
  const mode = session?.environment.accessAuditLogMode ?? "org";

  const setEnabled = api.accessAuditLog.setEnabled.useMutation({
    onSuccess: async () => {
      await updateSession();
      // Admins resolve org context from this query, not the session
      await utils.organizations.byId.invalidate();
    },
  });

  const enabled = setEnabled.isPending
    ? setEnabled.variables.enabled
    : (organization?.accessAuditLogEnabled ?? false);

  return (
    <SwitchInput
      id="access-audit-log-enabled"
      description={descriptions[mode]}
      checked={mode === "enforced" || (mode === "org" && enabled)}
      disabled={mode !== "org" || !hasAccess || setEnabled.isPending}
      onCheckedChange={(checked) =>
        setEnabled.mutate({ orgId: props.orgId, enabled: checked })
      }
    />
  );
}
