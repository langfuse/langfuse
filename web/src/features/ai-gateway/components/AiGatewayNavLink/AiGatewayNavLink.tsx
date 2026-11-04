import Link from "next/link";
import { Building2 } from "@langfuse/icons";

import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useAiGatewayPageVisibility } from "@/src/features/ai-gateway/hooks/useAiGatewayPageVisibility";
import { aiGatewayPath } from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";

/** Project-sidebar entry that leaves the project for the organization's AI Gateway. */
export function AiGatewayNavLink() {
  const { organization } = useQueryProjectOrOrganization();
  const { firstVisibleSlug } = useAiGatewayPageVisibility(organization?.id);

  return (
    <SidebarMenuButton
      asChild
      tooltip="AI Gateway (organization)"
      disabled={!organization}
    >
      <Link
        href={
          organization ? aiGatewayPath(organization.id, firstVisibleSlug) : "/"
        }
      >
        <Building2 size="base" />
        <span>AI Gateway</span>
      </Link>
    </SidebarMenuButton>
  );
}
