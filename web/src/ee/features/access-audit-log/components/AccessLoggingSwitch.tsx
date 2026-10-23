import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { useAccessAuditLogSetting } from "@/src/ee/features/access-audit-log/hooks/useAccessAuditLogSetting";

const descriptions = {
  org: "Record an audit event whenever a user or API key reads traces, observations, or scores in this organization.",
  enforced:
    "Your instance administrator has turned on access logging for every organization.",
  disabled: "Your instance administrator has turned off access logging.",
} as const;

export function AccessLoggingSwitch(props: { orgId: string }) {
  const setting = useAccessAuditLogSetting(props.orgId);

  return (
    <SwitchInput
      id="access-audit-log-enabled"
      description={descriptions[setting.mode]}
      checked={setting.checked}
      disabled={setting.disabled}
      onCheckedChange={setting.setEnabled}
    />
  );
}
