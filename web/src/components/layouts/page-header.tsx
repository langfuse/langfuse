import { EnvLabel } from "@/src/components/EnvLabel";
import { ItemBadge, LangfuseItemType } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import DocPopup from "@/src/components/layouts/doc-popup";
import { SidebarTrigger } from "@/src/components/ui/sidebar";

export type PageHeaderProps = {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  actionButtonsLeft?: React.ReactNode; // Right-side actions (buttons, etc.)
  actionButtonsRight?: React.ReactNode; // Right-side actions (buttons, etc.)
  help?: { description: string; href?: string; className?: string };
  itemType?: LangfuseItemType;
};

const PageHeader = ({
  title,
  itemType,
  actionButtonsLeft,
  actionButtonsRight,
  breadcrumb,
  help,
}: PageHeaderProps) => {
  return (
    <div className="sticky top-0 z-30 w-full border-b bg-background shadow-sm">
      <div className="flex flex-col justify-center">
        {/* Top Row */}
        <div className="flex h-12 items-center gap-3 border-b px-3 py-2">
          <SidebarTrigger />
          <div>
            <EnvLabel />
          </div>
          <BreadcrumbComponent items={breadcrumb} />
        </div>

        {/* Bottom Row */}
        <div className="flex h-16 items-center justify-between bg-muted p-3">
          <div className="flex items-center gap-2">
            {itemType && <ItemBadge type={itemType} showLabel />}
            <h1 className="text-lg font-semibold leading-7">{title}</h1>
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
          <div className="flex items-center gap-1">{actionButtonsRight}</div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
