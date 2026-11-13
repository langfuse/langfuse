import { useEffect } from "react";
import { useRouter } from "next/router";
import useLocalStorage from "@/src/components/useLocalStorage";

type AppShellVariant = "classic" | "next";

const APP_SHELL_VARIANT_STORAGE_KEY = "langfuse:app-shell:v1";
const DEFAULT_APP_SHELL_VARIANT: AppShellVariant = "next";

const isAppShellVariant = (value: unknown): value is AppShellVariant =>
  value === "classic" || value === "next";

/**
 * Per-browser switch between the classic and the new app shell, so both can
 * be compared side by side. `?shell=classic|next` on any page selects one and
 * remembers it, which makes the choice shareable as a link.
 */
export function useAppShellVariant() {
  const router = useRouter();
  const [storedVariant, setStoredVariant] = useLocalStorage<AppShellVariant>(
    APP_SHELL_VARIANT_STORAGE_KEY,
    DEFAULT_APP_SHELL_VARIANT,
  );
  const queryVariant = isAppShellVariant(router.query.shell)
    ? router.query.shell
    : null;

  // The URL is the external input here; persisting it keeps the choice
  // after the parameter is gone.
  useEffect(() => {
    if (queryVariant) setStoredVariant(queryVariant);
  }, [queryVariant, setStoredVariant]);

  const setVariant = (variant: AppShellVariant) => {
    setStoredVariant(variant);
    if (!queryVariant) return;
    // An explicit choice outranks the link that selected the current shell.
    const { shell: _shell, ...query } = router.query;
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };

  return {
    variant:
      queryVariant ??
      (isAppShellVariant(storedVariant)
        ? storedVariant
        : DEFAULT_APP_SHELL_VARIANT),
    setVariant,
  };
}
