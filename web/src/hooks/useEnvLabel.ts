import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useSession } from "next-auth/react";

export const useEnvLabel = () => {
  const session = useSession();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();

  if (!isLangfuseCloud) return { visible: false } as const;
  if (!session.data?.user?.email?.endsWith("@langfuse.com")) {
    return { visible: false } as const;
  }

  return {
    visible: true,
    region: region,
  } as const;
};
