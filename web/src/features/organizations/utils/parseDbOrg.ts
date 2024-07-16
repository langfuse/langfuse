import { cloudConfigSchema } from "@/src/features/cloud-config/types/cloudConfigSchema";
import { type Organization } from "@langfuse/shared";
import { type z } from "zod";

type parsedOrg = Omit<Organization, "cloudConfig"> & {
  cloudConfig: z.infer<typeof cloudConfigSchema> | null;
};

export function parseDbOrg(dbOrg: Organization): parsedOrg {
  const { cloudConfig, ...org } = dbOrg;

  const parsedCloudConfig = cloudConfigSchema.safeParse(cloudConfig);

  const parsedOrg = {
    ...org,
    cloudConfig: parsedCloudConfig.success ? parsedCloudConfig.data : null,
  };

  return parsedOrg;
}
