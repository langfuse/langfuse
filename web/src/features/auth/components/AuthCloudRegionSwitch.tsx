import { env } from "@/src/env.mjs";
import { CloudRegionPicker } from "@/src/features/auth/components/CloudRegionPicker";
import { getAvailableCloudRegionOptions } from "@/src/features/organizations/cloudRegions";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function CloudRegionSwitch({
  isSignUpPage,
}: {
  isSignUpPage?: boolean;
}) {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud, region: cloudRegion } = useLangfuseCloudRegion();
  const regions = getAvailableCloudRegionOptions(
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? cloudRegion,
  );

  if (!isLangfuseCloud) return null;

  const currentRegion = regions.find((region) => region.name === cloudRegion);

  return (
    <CloudRegionPicker
      regions={regions}
      selectedRegion={currentRegion}
      onValueChange={(value) => {
        const region = regions.find((region) => region.name === value);
        if (!region) return;
        capture(
          "sign_in:cloud_region_switch",
          {
            region: region.name,
          },
          {
            send_instantly: true,
          },
        );
        if (region.hostname) {
          window.location.hostname = region.hostname;
        }
      }}
      isSignUpPage={isSignUpPage}
    />
  );
}
