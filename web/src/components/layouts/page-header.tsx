import { EnvLabel } from "@/src/components/EnvLabel";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import DocPopup from "@/src/components/layouts/doc-popup";
import { SidebarTrigger } from "@/src/components/ui/sidebar";

export type PageHeaderProps = {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  actionButtonsLeft?: React.ReactNode; // Right-side actions (buttons, etc.)
  actionButtonsRight?: React.ReactNode; // Right-side actions (buttons, etc.)
  help?: { description: string; href?: string; className?: string };
  itemType?: string;
  itemLabel?: string;
};

const PageHeader = ({
  title,
  itemType,
  itemLabel,
  actionButtonsLeft,
  actionButtonsRight,
  breadcrumb,
  help,
}: PageHeaderProps) => {
  return (
    <div className="sticky top-0 z-30 w-full border-b bg-white shadow-sm">
      <div className="flex flex-col justify-center">
        {/* Top Row */}
        <div className="flex h-12 items-center gap-3 border-b px-3 py-2">
          <SidebarTrigger />
          <div>
            <EnvLabel />
          </div>
          {breadcrumb && <BreadcrumbComponent items={breadcrumb} />}
        </div>

        {/* Bottom Row */}
        <div className="flex h-16 items-center justify-between bg-sidebar p-3">
          <div className="flex items-center gap-2">
            {/* <ItemTypeLabel type={itemType} label={itemLabel} /> */}
            <h1 className="text-lg font-semibold leading-7">{title}</h1>
            {help && (
              <DocPopup description={help.description} href={help.href} />
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
