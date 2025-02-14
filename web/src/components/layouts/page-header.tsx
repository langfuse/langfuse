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
};

const PageHeader = ({
  title,
  itemType,
  actionButtonsLeft,
  actionButtonsRight,
  breadcrumb,
  help,
  container = false,
}: PageHeaderProps) => {
  return (
    <div className="sticky top-0 z-30 w-full border-b bg-background shadow-sm">
      <div className="flex flex-col justify-center">
        {/* Top Row */}
        <div className="border-b">
          <div
            className={cn(
              "flex min-h-12 items-center gap-3 px-3 py-2 md:max-h-12",
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
        <div className="bg-muted">
          <div
            className={cn(
              "flex min-h-16 items-center justify-between p-3 md:max-h-16",
              container && "lg:container",
            )}
          >
            <div className="flex-no-wrap flex min-h-16 items-center gap-1 md:max-h-16">
              {itemType && <ItemBadge type={itemType} showLabel />}
              <h2 className="line-clamp-2 h-16 min-w-0 place-content-center text-lg font-semibold leading-7">
                {title}
              </h2>
              {help && (
                <div className="-ml-2 -mt-2">
                  <DocPopup
                    description={help.description}
                    href={help.href}
                    className={help.className}
                  />
                </div>
              )}
              <div className="flex items-center gap-1">{actionButtonsLeft}</div>
            </div>
            <div className="flex flex-row flex-wrap items-center gap-1">
              {actionButtonsRight}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
