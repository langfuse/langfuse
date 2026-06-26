/**
 * Presentation shells for the layout-exploration stories (Phase 0).
 *
 * Kept out of the *.stories file so the stories module only exports stories
 * (eslint-plugin-storybook). `Triptych` renders one take at the three widths
 * that matter — desktop, narrow peek, mobile — so a reviewer can judge
 * responsiveness at a glance; `Stage` gives a single live, drag-resizable
 * instance for continuous testing.
 */

import { type ComponentType } from "react";

const WIDTHS: { label: string; w: number; h: number }[] = [
  { label: "Desktop · 1200px", w: 1200, h: 680 },
  { label: "Narrow peek · 540px", w: 540, h: 680 },
  { label: "Mobile · 380px", w: 380, h: 720 },
];

function Frame({
  label,
  w,
  h,
  children,
}: {
  label: string;
  w: number;
  h: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div
        className="bg-background overflow-hidden rounded-lg border shadow-sm"
        style={{ width: w, height: h, maxWidth: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}

export function Triptych({ take: Take }: { take: ComponentType }) {
  return (
    <div className="bg-muted/30 flex h-full min-h-screen flex-wrap items-start gap-6 p-6">
      {WIDTHS.map(({ label, w, h }) => (
        <Frame key={label} label={label} w={w} h={h}>
          <Take />
        </Frame>
      ))}
    </div>
  );
}

/** One full-bleed instance — drag the Storybook canvas to test breakpoints. */
export function Stage({ take: Take }: { take: ComponentType }) {
  return (
    <div className="h-full w-full">
      <Take />
    </div>
  );
}
