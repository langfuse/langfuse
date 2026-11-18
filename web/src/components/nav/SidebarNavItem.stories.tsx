import { useState } from "react";
import { LifeBuoy } from "@langfuse/icons";
import { expect, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { SidebarNavItem } from "./SidebarNavItem";

const meta = preview.meta({ component: SidebarNavItem.Button });

export const VariantMatrix = meta.story({
  render: () => (
    <div className="bg-sidebar flex w-51 flex-col gap-0.5 p-2">
      <SidebarNavItem.Button leading={<LifeBuoy />} label="Support" />
      <SidebarNavItem.Button
        leading={<LifeBuoy />}
        label="Support"
        labelBadge={<FeatureReleaseStatus status="beta" />}
      />
      <SidebarNavItem.Button
        leading={<LifeBuoy />}
        label="Go to..."
        trailing={<KeyboardShortcut keys={["Mod", "K"]} />}
      />
    </div>
  ),
});

export const CollapsingAfterHover = meta.story({
  name: "(Test) Collapsing after hover keeps the preview closed",
  render: () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
      <>
        <SidebarNavItem.Button
          isCollapsed={isCollapsed}
          leading={<LifeBuoy size="base" />}
          label="Support"
        />
        <Button
          text="Collapse navigation"
          onClick={() => setIsCollapsed(true)}
        />
      </>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Support" });
    await userEvent.hover(trigger);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.unhover(trigger);
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse navigation" }),
    );

    await expect(canvas.getByRole("button", { name: "Support" })).toBe(trigger);
    // A delayed hover must also stay closed after the pointer has left.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("tooltip", {
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  },
});
