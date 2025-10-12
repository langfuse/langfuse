import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useTranslation } from "react-i18next";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  const { t } = useTranslation();
  return (
    <div className="flex items-center space-x-1">
      <span className="mr-2">{t("ui.layout.navigation.theme")}</span>
      <div title={t("ui.layout.navigation.themeModes.light")}>
        <Sun
          className={cn(
            theme === "light" ? "text-primary-accent" : "",
            "text:primary h-[1.6rem] w-[1.6rem] rounded-sm p-1 hover:bg-input hover:text-primary-accent",
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
      <div title={t("ui.layout.navigation.themeModes.dark")}>
        <Moon
          className={cn(
            theme === "dark" ? "text-primary-accent" : "",
            "h-[1.6rem] w-[1.6rem] rounded-sm p-1 hover:bg-input hover:text-primary-accent",
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
      <div title={t("ui.layout.navigation.themeModes.system")}>
        <Monitor
          className={cn(
            theme === "system" ? "text-primary-accent" : "",
            "h-[1.6rem] w-[1.6rem] rounded-sm p-1 hover:bg-input hover:text-primary-accent",
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
