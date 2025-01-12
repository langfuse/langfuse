import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ArrowUpRight,
  Bug,
  Github,
  LibraryBig,
  LifeBuoy,
  Lightbulb,
  MessageCircle,
  MessageSquarePlus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode } from "react";
import {
  type UiCustomizationOption,
  useUiCustomization,
} from "@/src/ee/features/ui-customization/useUiCustomization";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import {
  chatAvailable,
  chatIsVisible,
  showChat,
  hideChat,
} from "@/src/features/support-chat/chat";
import { Switch } from "@/src/components/ui/switch";
import { SiDiscord } from "react-icons/si";

type SupportMenuItem = {
  title: string;
  pathname: string;
  icon: LucideIcon | React.ElementType;
  menuNode?: ReactNode;
  customizableHref?: UiCustomizationOption;
};

export function SupportMenuDropdown() {
  const uiCustomization = useUiCustomization();

  const supportMenuItems: (SupportMenuItem | "separator")[] = [
    {
      title: "Ask AI",
      pathname: "https://langfuse.com/docs/ask-ai",
      icon: Sparkles,
    },
  ];

  const chatVisible = chatIsVisible();
  if (uiCustomization?.supportHref) {
    supportMenuItems.push({
      title: "Support",
      pathname: uiCustomization.supportHref,
      icon: LifeBuoy,
    });
  } else {
    if (chatAvailable) {
      supportMenuItems.push({
        title: "Chat",
        pathname: "#",
        menuNode: (
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>Chat</span>
            <Switch
              defaultChecked={chatVisible}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={(checked) => {
                if (checked) {
                  showChat();
                } else {
                  hideChat();
                }
              }}
              className="ml-auto"
            />
          </div>
        ),
        icon: MessageCircle,
      });
    }
    supportMenuItems.push("separator");
    supportMenuItems.push({
      title: "GitHub Support",
      pathname: "https://langfuse.com/gh-support",
      icon: Github,
    });
    supportMenuItems.push({
      title: "Discord",
      pathname: "https://langfuse.com/discord",
      icon: SiDiscord,
    });
  }

  supportMenuItems.push("separator");
  supportMenuItems.push({
    title: "Docs",
    pathname: "https://langfuse.com/docs",
    icon: LibraryBig,
    customizableHref: "documentationHref",
  });
  supportMenuItems.push("separator");

  if (uiCustomization?.feedbackHref) {
    supportMenuItems.push({
      title: "Feedback",
      pathname: uiCustomization.feedbackHref,
      icon: MessageSquarePlus,
    });
  } else {
    supportMenuItems.push(
      ...[
        {
          title: "Feature Request",
          pathname: "https://langfuse.com/ideas",
          icon: Lightbulb,
        },
        {
          title: "Report a Bug",
          pathname: "https://langfuse.com/issues",
          icon: Bug,
        },
      ],
    );
  }

  const { isMobile } = useSidebar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton>
          <LifeBuoy className="h-4 w-4" />
          Support
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        {supportMenuItems.map((item) => {
          if (item === "separator") {
            return <DropdownMenuSeparator key="separator" />;
          }
          const url = item.customizableHref
            ? (uiCustomization?.[item.customizableHref] ?? item.pathname)
            : item.pathname;
          return (
            <DropdownMenuItem key={item.title} asChild>
              {item.menuNode ?? (
                <a
                  href={url}
                  target={url.startsWith("http") ? "_blank" : undefined}
                  rel={
                    url.startsWith("http") ? "noopener noreferrer" : undefined
                  }
                  className="flex cursor-pointer items-center"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.title}
                  {url.startsWith("http") && (
                    <ArrowUpRight className="ml-1 h-3 w-3" />
                  )}
                </a>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
