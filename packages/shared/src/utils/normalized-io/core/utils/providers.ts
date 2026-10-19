import { registeredProviders } from "../../conventions";
import type { IOConvention } from "../../conventions/io-convention";

/** Put a claimed root provider first without excluding other dialects. */
export function providersInOrder(
  preferredProvider?: IOConvention,
): readonly IOConvention[] {
  if (!preferredProvider) return registeredProviders;
  return [
    preferredProvider,
    ...registeredProviders.filter((provider) => provider !== preferredProvider),
  ];
}
