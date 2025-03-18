import { EnvLabel } from "@/src/components/EnvLabel";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import DocPopup from "@/src/components/layouts/doc-popup";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import { cn } from "@/src/utils/tailwind";

export type PageHeaderProps = {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  actionButtonsLeft?: React.ReactNode; // Right-side actions (buttons, etc.)
  actionButtonsRight?: React.ReactNode; // Right-side actions (buttons, etc.)
  help?: { description: string; href?: string; className?: string };
  itemType?: LangfuseItemType;
  container?: boolean;
  tabsComponent?: React.ReactNode;
};

const PageHeader = ({
  title,
  itemType,
  actionButtonsLeft,
  actionButtonsRight,
  breadcrumb,
  help,
  tabsComponent,
  container = false,
}: PageHeaderProps) => {
  return (
    <div className="sticky top-0 z-30 w-full border-b bg-background shadow-sm">
      <div className="flex flex-col justify-center">
        {/* Top Row */}
        <div className="border-b">
          <div
            className={cn(
              "flex min-h-12 items-center gap-3 px-3 py-2",
              container && "lg:container",
            )}
          >
            <SidebarTrigger />
            <div>
              <EnvLabel />
            </div>
            <BreadcrumbComponent items={breadcrumb} />
          </div>
        </div>

        {/* Bottom Row */}
        <div className="bg-header">
          <div
            className={cn(
              "flex min-h-12 w-full flex-wrap items-center justify-between gap-1 px-3 py-1 md:flex-nowrap",
              container && "lg:container",
            )}
          >
            {/* Left side content */}
            <div className="flex flex-grow flex-wrap items-center md:flex-grow-0">
              <div className="mr-2 flex items-center gap-1">
                {itemType && (
                  <div className="flex items-center">
                    <ItemBadge type={itemType} showLabel />
                  </div>
                )}
                <div className="relative inline-block max-w-md md:max-w-none">
                  <h2 className="inline text-lg font-semibold leading-7">
                    <span className="break-words">
                      {title}
                      {help && (
                        <span className="whitespace-nowrap">
                          &nbsp;
                          <DocPopup
                            description={help.description}
                            href={help.href}
                            className={help.className}
                          />
                        </span>
                      )}
                    </span>
                  </h2>
                </div>
              </div>
              {actionButtonsLeft && (
                <div className="flex flex-wrap items-center gap-1 self-center">
                  {actionButtonsLeft}
                </div>
              )}
            </div>

            {/* Right side content */}
            <div className="ml-auto flex flex-grow flex-wrap items-center justify-end gap-1">
              {actionButtonsRight}
            </div>
          </div>

          <div className="ml-2">{tabsComponent}</div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
