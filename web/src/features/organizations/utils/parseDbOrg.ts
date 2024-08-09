import { CloudConfigSchema } from "@/src/features/organizations/utils/cloudConfigSchema";
import { type Organization } from "@langfuse/shared";

type parsedOrg = Omit<Organization, "cloudConfig"> & {
  cloudConfig: CloudConfigSchema | null;
};

export function parseDbOrg(dbOrg: Organization): parsedOrg {
  const { cloudConfig, ...org } = dbOrg;

  const parsedCloudConfig = CloudConfigSchema.safeParse(cloudConfig);

  const parsedOrg = {
    ...org,
    cloudConfig: parsedCloudConfig.success ? parsedCloudConfig.data : null,
  };

  return parsedOrg;
}
