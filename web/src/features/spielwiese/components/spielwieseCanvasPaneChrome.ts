import { cn } from "@/src/utils/tailwind";

const spielwieseCanvasPaneChromeBarBaseClassName =
  "-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 bg-[rgba(251,251,251,0.82)] px-2 py-2 supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md";

export const spielwieseCanvasPaneHeaderClassName = cn(
  spielwieseCanvasPaneChromeBarBaseClassName,
  "shrink-0 justify-between rounded-t-[var(--canvas-pane-inner-radius)]",
);

export const spielwieseCanvasPaneFooterClassName = cn(
  spielwieseCanvasPaneChromeBarBaseClassName,
  "-mb-[calc(var(--canvas-pane-shell-gap)+6px)] flex-none justify-start rounded-b-[var(--canvas-pane-inner-radius)]",
);
