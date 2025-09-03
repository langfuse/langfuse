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
  Radio,
  LibraryBig,
  LifeBuoy,
  Lightbulb,
  MessageCircle,
  MessageSquarePlus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useMemo, type ReactNode } from "react";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { env } from "@/src/env.mjs";
import { chatAvailable, openChat } from "@/src/features/support-chat/PlainChat";
import { useTranslation } from "next-i18next";

type SupportMenuItem = {
  title: string;
  pathname: string;
  icon: LucideIcon | React.ElementType;
  menuNode?: ReactNode;
};

export const SupportMenuDropdown = () => {
  const { t } = useTranslation("common");
  const uiCustomization = useUiCustomization();

  const supportMenuItems: (SupportMenuItem | "separator")[] = useMemo(() => {
    const items: (SupportMenuItem | "separator")[] = [
      {
        title: t("common.askAI"),
        pathname: "https://langfuse.com/docs/ask-ai",
        icon: Sparkles,
      },
    ];

    if (uiCustomization?.supportHref) {
      items.push({
        title: t("common.support"),
        pathname: uiCustomization.supportHref,
        icon: LifeBuoy,
      });
    } else {
      if (chatAvailable) {
        items.push({
          title: t("common.chat"),
          pathname: "#",
          menuNode: (
            <div className="flex items-center gap-2" onClick={() => openChat()}>
              <MessageCircle className="h-4 w-4" />
              <span>{t("common.contactSupport")}</span>
            </div>
          ),
          icon: MessageCircle,
        });
      }
      items.push("separator");
      items.push({
        title: t("common.githubSupport"),
        pathname: "https://langfuse.com/gh-support",
        icon: Github,
      });
      items.push({
        title: t("common.discord"),
        pathname: "https://langfuse.com/discord",
        icon: SiDiscord,
      });
    }

    items.push("separator");
    items.push({
      title: t("common.docs"),
      pathname:
        uiCustomization?.documentationHref ?? "https://langfuse.com/docs",
      icon: LibraryBig,
    });
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      items.push({
        title: t("common.statusPage"),
        pathname: "https://status.langfuse.com",
        icon: Radio,
      });
    }
    items.push("separator");

    if (uiCustomization?.feedbackHref) {
      items.push({
        title: t("common.feedback"),
        pathname: uiCustomization.feedbackHref,
        icon: MessageSquarePlus,
      });
    } else {
      items.push(
        ...[
          {
            title: t("common.featureRequest"),
            pathname: "https://langfuse.com/ideas",
            icon: Lightbulb,
          },
          {
            title: t("common.reportBug"),
            pathname: "https://langfuse.com/issues",
            icon: Bug,
          },
        ],
      );
    }

    return items;
  }, [uiCustomization, t]);

  const { isMobile } = useSidebar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton>
          <LifeBuoy className="h-4 w-4" />
          {t("common.support")}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        {supportMenuItems.map((item, index) => {
          if (item === "separator") {
            return <DropdownMenuSeparator key={`separator-${index}`} />;
          }

          return (
            <DropdownMenuItem key={item.title} asChild>
              {item.menuNode ?? (
                <a
                  href={item.pathname}
                  target={
                    item.pathname.startsWith("http") ? "_blank" : undefined
                  }
                  rel={
                    item.pathname.startsWith("http") ? "noopener" : undefined
                  }
                  className="flex cursor-pointer items-center"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.title}
                  {item.pathname.startsWith("http") && (
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
};
