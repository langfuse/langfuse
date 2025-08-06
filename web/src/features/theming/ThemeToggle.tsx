import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  return (
    <div className="flex items-center space-x-1">
      <span className="mr-2">テーマ</span>
      <div title="ライトモード">
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
      <div title="ダークモード">
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
      <div title="システムモード">
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
