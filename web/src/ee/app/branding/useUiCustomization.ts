import { useHasEntitlement } from "@/src/entitlements";
import { api } from "@/src/app/utils/api";

export const useUiCustomization = () => {
  const hasEntitlement = useHasEntitlement("self-host-ui-customization");
  const customization = api.uiCustomization.get.useQuery(undefined, {
    enabled: hasEntitlement,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!hasEntitlement) return null;
  return customization.data ?? null;
};
