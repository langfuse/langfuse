import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const t = useTranslations("accountMenu");
  const { theme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  return (
    <div className="flex items-center space-x-1">
      <span className="mr-2">{t("theme")}</span>
      <div title={t("lightMode")}>
        <Sun
          className={cn(
            theme === "light" ? "text-primary-accent" : "",
            "text:primary hover:bg-input hover:text-primary-accent h-[1.6rem] w-[1.6rem] rounded-sm p-1",
          )}
          onClick={(e) => {
            e.preventDefault();
            setTheme("light");
            capture("user_settings:theme_changed", {
              theme: "light",
            });
          }}
        />
      </div>
      <div title={t("darkMode")}>
        <Moon
          className={cn(
            theme === "dark" ? "text-primary-accent" : "",
            "hover:bg-input hover:text-primary-accent h-[1.6rem] w-[1.6rem] rounded-sm p-1",
          )}
          onClick={(e) => {
            e.preventDefault();
            setTheme("dark");
            capture("user_settings:theme_changed", {
              theme: "dark",
            });
          }}
        />
      </div>
      <div title={t("systemMode")}>
        <Monitor
          className={cn(
            theme === "system" ? "text-primary-accent" : "",
            "hover:bg-input hover:text-primary-accent h-[1.6rem] w-[1.6rem] rounded-sm p-1",
          )}
          onClick={(e) => {
            e.preventDefault();
            setTheme("system");
            capture("user_settings:theme_changed", {
              theme: "system",
            });
          }}
        />
      </div>
    </div>
  );
}
