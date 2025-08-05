import { type Flag } from "@/src/features/feature-flags/types";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import {
  Database,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  type LucideIcon,
  Settings,
  UsersIcon,
  TerminalIcon,
  Lightbulb,
  Grid2X2,
  Sparkle,
  FileJson,
  Search,
  Home,
  SquarePercent,
  ClipboardPen,
  Clock,
} from "lucide-react";
import { type ReactNode } from "react";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type User } from "next-auth";
import { type OrganizationScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { SupportMenuDropdown } from "@/src/components/nav/support-menu-dropdown";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { CloudStatusMenu } from "@/src/features/cloud-status-notification/components/CloudStatusMenu";
import { type ProductModule } from "@/src/ee/features/ui-customization/productModuleSchema";

export enum RouteSection {
  Main = "main",
  Secondary = "secondary",
}

export enum RouteGroup {
  Observability = "可観測性",
  PromptManagement = "プロンプト管理",
  Evaluation = "評価",
}

export type Route = {
  title: string;
  menuNode?: ReactNode;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScopes?: ProjectScope[]; // array treated as OR
  organizationRbacScope?: OrganizationScope;
  icon?: LucideIcon; // ignored for nested routes
  pathname: string; // link
  items?: Array<Route>; // folder
  section?: RouteSection; // which section of the sidebar (top/main/bottom)
  newTab?: boolean; // open in new tab
  entitlements?: Entitlement[]; // entitlements required, array treated as OR
  productModule?: ProductModule; // Product module this route belongs to. Used to show/hide modules via ui customization.
  show?: (p: {
    organization: User["organizations"][number] | undefined;
  }) => boolean;
  group?: RouteGroup; // group this route belongs to (within a section)
};

export const ROUTES: Route[] = [
  {
    title: "移動...",
    pathname: "", // Empty pathname since this is a dropdown
    icon: Search,
    menuNode: <CommandMenuTrigger />,
    section: RouteSection.Main,
  },
  {
    title: "組織",
    pathname: "/",
    icon: Grid2X2,
    show: ({ organization }) => organization === undefined,
    section: RouteSection.Main,
  },
  {
    title: "プロジェクト",
    pathname: "/organization/[organizationId]",
    icon: Grid2X2,
    section: RouteSection.Main,
  },
  {
    title: "ホーム",
    pathname: `/project/[projectId]`,
    icon: Home,
    section: RouteSection.Main,
  },
  {
    title: "ダッシュボード",
    pathname: `/project/[projectId]/dashboards`,
    icon: LayoutDashboard,
    productModule: "dashboards",
    section: RouteSection.Main,
  },
  {
    title: "トレーシング",
    icon: ListTree,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
    pathname: `/project/[projectId]/traces`,
  },
  {
    title: "セッション",
    icon: Clock,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
    pathname: `/project/[projectId]/sessions`,
  },
  {
    title: "ユーザー",
    pathname: `/project/[projectId]/users`,
    icon: UsersIcon,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
  },
  {
    title: "プロンプト",
    pathname: "/project/[projectId]/prompts",
    icon: FileJson,
    projectRbacScopes: ["prompts:read"],
    productModule: "prompt-management",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "プレイグラウンド",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    productModule: "playground",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "スコア",
    pathname: `/project/[projectId]/scores`,
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    icon: SquarePercent,
  },
  {
    title: "LLM判定機能",
    icon: Lightbulb,
    productModule: "evaluation",
    projectRbacScopes: ["evalJob:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    pathname: `/project/[projectId]/evals`,
  },
  {
    title: "人手アノテーション",
    pathname: `/project/[projectId]/annotation-queues`,
    projectRbacScopes: ["annotationQueues:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    icon: ClipboardPen,
  },
  {
    title: "データセット",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
    productModule: "datasets",
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
  },
  {
    title: "アップグレード",
    icon: Sparkle,
    pathname: "/project/[projectId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "アップグレード",
    icon: Sparkle,
    pathname: "/organization/[organizationId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "クラウドステータス",
    section: RouteSection.Secondary,
    pathname: "",
    menuNode: <CloudStatusMenu />,
  },
  {
    title: "設定",
    pathname: "/project/[projectId]/settings",
    icon: Settings,
    section: RouteSection.Secondary,
  },
  {
    title: "設定",
    pathname: "/organization/[organizationId]/settings",
    icon: Settings,
    section: RouteSection.Secondary,
  },
  {
    title: "サポート",
    icon: LifeBuoy,
    section: RouteSection.Secondary,
    pathname: "", // Empty pathname since this is a dropdown
    menuNode: <SupportMenuDropdown />,
  },
];

function CommandMenuTrigger() {
  const { setOpen } = useCommandMenu();
  const capture = usePostHogClientCapture();

  return (
    <SidebarMenuButton
      onClick={() => {
        capture("cmd_k_menu:opened", {
          source: "main_navigation",
        });
        setOpen(true);
      }}
      className="whitespace-nowrap"
    >
      <Search className="h-4 w-4" />
      移動...
      <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded-md border px-1.5 font-mono text-[10px]">
        {navigator.userAgent.includes("Mac") ? (
          <span className="text-[12px]">⌘</span>
        ) : (
          <span>Ctrl</span>
        )}
        <span>K</span>
      </kbd>
    </SidebarMenuButton>
  );
}
