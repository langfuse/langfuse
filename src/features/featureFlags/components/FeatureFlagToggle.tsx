import { type Flag } from "@/src/features/featureFlags/types";
import { useSession } from "next-auth/react";

export const FeatureFlagToggle = (props: {
  featureFlag: Flag;
  whenEnabled?: React.ReactNode;
  whenDisabled?: React.ReactNode;
  whenLoading?: React.ReactNode;
}) => {
  const session = useSession();
  const flags = session.data?.user?.featureFlags;
  const isEnabled = flags !== undefined && flags[props.featureFlag];

  if (session.status === "loading") {
    return props.whenLoading ?? <div>Loading ...</div>;
  }

  return isEnabled ? props.whenEnabled ?? <></> : props.whenDisabled ?? <></>;
};
