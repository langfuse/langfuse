import type { ReactNode } from "react";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import { type ShellBreadcrumbItem, ShellBreadcrumbs } from "./Breadcrumbs";
import { type PromptStage } from "./product-manifest";
import { type PromptStageTab, PromptStageTabs } from "./PromptStageTabs";

type ProductHeaderProps = {
  title: string;
  titleContent?: ReactNode;
  breadcrumbs: ShellBreadcrumbItem[];
  promptTabs?: PromptStageTab[];
  activePromptStage?: PromptStage;
};

export function ProductHeader({
  title,
  titleContent,
  breadcrumbs,
  promptTabs,
  activePromptStage,
}: ProductHeaderProps) {
  const promptHeaderContent =
    titleContent && promptTabs && activePromptStage
      ? {
          titleContent,
          promptTabs,
          activePromptStage,
        }
      : null;

  return (
    <header className="top-banner-offset bg-background sticky z-30 w-full border-b shadow-xs">
      {promptHeaderContent ? (
        <div className="flex h-10 items-center gap-3 px-3">
          <div className="max-w-[48%] min-w-0 flex-1">
            <ShellBreadcrumbs
              leadingContent={<SidebarTrigger className="size-7" />}
              items={
                breadcrumbs.length > 0 ? breadcrumbs.slice(0, -1) : breadcrumbs
              }
              tailContent={promptHeaderContent.titleContent}
            />
          </div>
          <h1 className="sr-only">{title}</h1>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex justify-start md:justify-center">
              <PromptStageTabs
                activeStage={promptHeaderContent.activePromptStage}
                tabs={promptHeaderContent.promptTabs}
              />
            </div>
          </div>
          <div aria-hidden className="hidden flex-1 md:block" />
        </div>
      ) : (
        <>
          <div className="flex min-h-11 items-center px-3 py-2">
            <ShellBreadcrumbs
              leadingContent={<SidebarTrigger className="size-7" />}
              items={breadcrumbs}
            />
          </div>
          <div className="bg-header border-t">
            <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                {titleContent ? (
                  <>
                    <h1 className="sr-only">{title}</h1>
                    {titleContent}
                  </>
                ) : (
                  <h1 className="truncate text-lg leading-7 font-semibold">
                    {title}
                  </h1>
                )}
              </div>
            </div>
            {promptTabs && activePromptStage ? (
              <div className="px-3 pb-3">
                <PromptStageTabs
                  activeStage={activePromptStage}
                  tabs={promptTabs}
                />
              </div>
            ) : null}
          </div>
        </>
      )}
    </header>
  );
}
