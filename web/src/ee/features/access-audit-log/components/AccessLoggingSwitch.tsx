import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { useAccessAuditLogSetting } from "@/src/ee/features/access-audit-log/hooks/useAccessAuditLogSetting";

export function AccessLoggingSwitch(props: { orgId: string }) {
  const setting = useAccessAuditLogSetting(props.orgId);

  return (
    <SwitchInput
      id="access-audit-log-enabled"
      description="Record an audit event whenever a user or API key reads traces, observations, or scores in this organization."
      checked={setting.enabled}
      disabled={setting.disabled}
      onCheckedChange={setting.setEnabled}
    />
  );
}
