import { useEffect } from "react";

import {
  mountThemeLab,
  unmountThemeLab,
} from "@/src/features/theme-lab/theme-lab-script";

/**
 * Dev-only mount point for the Theme Lab panel (see ./README.md).
 *
 * Renders nothing; the effect owns an imperative DOM panel (external system:
 * setup mounts it, cleanup removes it). The NODE_ENV check is a static
 * condition so the whole branch - and with it the theme-lab-script import -
 * is dead-code-eliminated from production bundles.
 */
export function ThemeLabMount(): null {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      window.themeLab = {
        enable() {
          localStorage.setItem("themeLab", "1");
          mountThemeLab();
        },
        disable() {
          localStorage.removeItem("themeLab");
          unmountThemeLab();
        },
      };
      if (localStorage.getItem("themeLab") === "1") {
        mountThemeLab();
      }
      return () => {
        unmountThemeLab();
        delete window.themeLab;
      };
    }
  }, []);
  return null;
}
