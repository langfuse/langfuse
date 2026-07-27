import type { ComponentProps } from "react";
import { Activity, BookOpen, Home, Settings } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

const meta = preview.meta({
  component: AppSidebar,
  args: {
    navItems: {
      ungrouped: [
        { title: "Home", url: "/", icon: Home, isActive: true },
        { title: "Traces", url: "/traces", icon: Activity },
        { title: "Prompts", url: "/prompts", icon: BookOpen },
      ],
      grouped: null,
    },
    secondaryNavItems: {
      ungrouped: [{ title: "Settings", url: "/settings", icon: Settings }],
      grouped: null,
    },
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatar: "",
    },
    userMenuItems: [
      { name: "Account Settings", href: "/account/settings" },
      { name: "Sign out", onClick: fn() },
    ],
    isMobile: false,
    versionState: {
      deployment: "cloud",
    } satisfies ComponentProps<typeof AppSidebar>["versionState"],
    showDemoBadge: false,
  },
});

const SidebarStory = ({
  open,
  args,
}: {
  open: boolean;
  args: ComponentProps<typeof AppSidebar>;
}) => (
  <SidebarProvider open={open}>
    <AppSidebar {...args} />
    <SidebarInset>
      <div className="bg-muted/30 h-full" />
    </SidebarInset>
  </SidebarProvider>
);

export const Default = meta.story({
  render: (args) => <SidebarStory open args={args} />,
});

export const Collapsed = meta.story({
  render: (args) => <SidebarStory open={false} args={args} />,
});
