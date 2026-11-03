import { createContext } from "react";

export type GatewaySecretKey = {
  value: string;
  onAfterCopy?: () => void;
  onAfterReveal?: () => void;
};

/** The just-created secret key; undefined once it can no longer be shown. */
export const GatewaySecretKeyContext = createContext<
  GatewaySecretKey | undefined
>(undefined);
