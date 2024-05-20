import { OrganizationProjectOverview } from "@/src/features/organizations/components/ProjectOverview";
import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";

export default function GetStartedPage() {
  const organization = useQueryOrganization();
  if (!organization) return null;
  return (
    <div className="md:container">
      <OrganizationProjectOverview orgId={organization.id} />
    </div>
  );
}
