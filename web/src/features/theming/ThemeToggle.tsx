import * as React from "react";
import { Monitor, Moon, Sun } from "@langfuse/icons";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  return (
    <div className="flex items-center space-x-1">
      <span className="mr-2">Theme</span>
      <div title="Light mode">
        <Sun
          size="lg"
          __rawClassName={cn(
            theme === "light" ? "text-primary-accent" : "",
            "hover:bg-input hover:text-primary-accent rounded-sm p-1",
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
          size="lg"
          __rawClassName={cn(
            theme === "dark" ? "text-primary-accent" : "",
            "hover:bg-input hover:text-primary-accent rounded-sm p-1",
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
          size="lg"
          __rawClassName={cn(
            theme === "system" ? "text-primary-accent" : "",
            "hover:bg-input hover:text-primary-accent rounded-sm p-1",
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
