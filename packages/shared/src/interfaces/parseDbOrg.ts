import { type Organization } from "@prisma/client";
import { CloudConfigSchema } from "./cloudConfigSchema";

export type ParsedOrganization = Omit<Organization, "cloudConfig"> & {
  cloudConfig: CloudConfigSchema | null;
};

export function parseDbOrg(dbOrg: Organization): ParsedOrganization {
  const { cloudConfig, ...org } = dbOrg;

  const parsedCloudConfig = CloudConfigSchema.safeParse(cloudConfig);

  const parsedOrg = {
    ...org,
    cloudConfig: parsedCloudConfig.success ? parsedCloudConfig.data : null,
  };

  return parsedOrg;
}
