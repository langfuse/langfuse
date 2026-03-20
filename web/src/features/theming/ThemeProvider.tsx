"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useNonce } from "@/src/features/security/NonceContext";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const nonce = useNonce();
  return (
    <NextThemesProvider nonce={nonce || undefined} {...props}>
      {children}
    </NextThemesProvider>
  );
}
