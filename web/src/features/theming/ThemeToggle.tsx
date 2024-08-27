import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  return (
    <div className="ml-auto flex items-center space-x-1">
      <div title="Light mode">
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
      <div title="Dark mode">
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
      <div title="System mode">
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
