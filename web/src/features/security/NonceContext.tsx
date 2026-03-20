import { createContext, useContext } from "react";

const NonceContext = createContext<string>("");

export function NonceProvider({
  nonce,
  children,
}: {
  nonce: string;
  children: React.ReactNode;
}) {
  return (
    <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>
  );
}

export function useNonce(): string {
  return useContext(NonceContext);
}
