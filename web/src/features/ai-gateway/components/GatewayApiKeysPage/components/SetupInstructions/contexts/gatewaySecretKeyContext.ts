import { createContext } from "react";

/** The just-created secret key; undefined once it can no longer be shown. */
export const GatewaySecretKeyContext = createContext<string | undefined>(
  undefined,
);
