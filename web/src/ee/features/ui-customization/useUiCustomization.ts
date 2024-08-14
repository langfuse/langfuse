import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";
import { api } from "@/src/utils/api";

export const useUiCustomization = () => {
  const isEeVersion = useIsEeEnabled();
  const customization = api.uiCustomization.get.useQuery(undefined, {
    enabled: isEeVersion,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!isEeVersion) return null;
  return customization.data ?? null;
};

export type UiCustomizationOption = keyof NonNullable<
  ReturnType<typeof useUiCustomization>
>;
