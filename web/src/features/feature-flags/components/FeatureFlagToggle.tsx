import { type Flag } from "@/src/features/feature-flags/types";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";

export const FeatureFlagToggle = (props: {
  featureFlag: Flag;
  whenEnabled?: React.ReactNode;
  whenDisabled?: React.ReactNode;
  whenLoading?: React.ReactNode;
}) => {
  const session = useSession();
  const enableExperimentalFeatures =
    api.environment.enableExperimentalFeatures.useQuery().data;

  if (enableExperimentalFeatures) return props.whenEnabled ?? <></>;

  const flags = session.data?.user?.featureFlags;
  const isEnabled = flags !== undefined && flags[props.featureFlag];

  if (session.status === "loading") {
    return props.whenLoading ?? <div>Loading ...</div>;
  }

  return isEnabled ? props.whenEnabled ?? <></> : props.whenDisabled ?? <></>;
};
