import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

export const spielwiesePromptDeckCardShellClassName =
  "group flex w-full flex-col gap-0.5 overflow-visible rounded-(--node-shell-radius) border border-[rgba(15,23,42,0.08)] bg-[#F1F2F2] shadow-[0_12px_30px_rgba(15,23,42,0.04),0_2px_6px_rgba(15,23,42,0.04)] transition-[box-shadow,border-color,background-color,transform] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [--node-shell-gap:2px] [--node-shell-radius:18px]";

type SpielwiesePromptDeckCardShellProps = HTMLAttributes<HTMLDivElement>;

export function SpielwiesePromptDeckCardShell({
  children,
  className,
  ...props
}: SpielwiesePromptDeckCardShellProps) {
  return (
    <div
      className={cn(spielwiesePromptDeckCardShellClassName, className)}
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
        "rounded-[var(--node-shell-radius)] bg-[#F1F2F2] p-0.5 transition-[margin,background-color,padding] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
