import * as React from "react";
import { History, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  return (
    <div className="flex items-center space-x-1">
      <span className="mr-2">Theme</span>
      <div title="Light mode">
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
      <div title="Dark mode">
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
      {/* TEMPORARY test option: pre-Linear dark theme for comparison while
          the dark-mode branch is under review — remove before merge. */}
      <div title="Dark mode (legacy, pre-Linear — test only)">
        <History
          className={cn(
            theme === "dark-legacy" ? "text-primary-accent" : "",
            "hover:bg-input hover:text-primary-accent h-[1.6rem] w-[1.6rem] rounded-sm p-1",
          )}
          onClick={(e) => {
            e.preventDefault();
            setTheme("dark-legacy");
            capture("user_settings:theme_changed", {
              theme: "dark-legacy",
            });
          }}
        />
      </div>
      <div title="System mode">
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
