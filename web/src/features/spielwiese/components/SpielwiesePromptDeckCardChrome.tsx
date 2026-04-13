import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { spielwieseAgentNodeColorVariableStyle } from "./spielwieseAgentNodeColorPalette";

export const spielwiesePromptDeckCardShellClassName =
  "group flex w-full flex-col gap-0.5 overflow-visible rounded-(--node-shell-radius) border border-[color:var(--spielwiese-agent-node-shell-border)] bg-[var(--spielwiese-agent-node-shell-surface)] shadow-none transition-[box-shadow,border-color,background-color,transform] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [--node-shell-gap:2px] [--node-shell-radius:18px]";

type SpielwiesePromptDeckCardShellProps = HTMLAttributes<HTMLDivElement>;

export function SpielwiesePromptDeckCardShell({
  children,
  className,
  style,
  ...props
}: SpielwiesePromptDeckCardShellProps) {
  return (
    <div
      className={cn(spielwiesePromptDeckCardShellClassName, className)}
      style={{ ...spielwieseAgentNodeColorVariableStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export function SpielwiesePromptDeckCardHeaderFrame({
  children,
  className,
  overlap = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  overlap?: boolean;
}) {
  return (
    <div
      className={cn(
        overlap ? "-mb-0.5" : "mb-0",
        "rounded-[var(--node-shell-radius)] bg-[var(--spielwiese-agent-node-shell-surface)] p-0.5 transition-[margin,background-color,padding] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
