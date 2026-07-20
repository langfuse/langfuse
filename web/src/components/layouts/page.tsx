import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { PageHeaderControlsSlotProvider } from "@/src/components/layouts/page-header-controls-slot";
import { MobileTopBar } from "@/src/components/layouts/mobile-top-bar";
import { MobilePageTitle } from "@/src/components/layouts/mobile-page-title";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";

type PageContainerProps = {
  children: React.ReactNode;
  headerProps: Omit<PageHeaderProps, "container">;
  scrollable?: boolean;
  withPadding?: boolean;
};

const Page = ({
  children,
  headerProps,
  scrollable = false,
  withPadding = false,
}: PageContainerProps) => {
  // Minimal-chrome mobile shell: a slim sticky top bar (menu + brand + account)
  // plus a page-title block that lives in the scrollable content. We mount one
  // header path (rather than CSS-toggle both) so there is a single
  // controls-slot target for the time-range / refresh portal — two live targets
  // would fight over the single slot node.
  const isMobile = useIsMobile();

  return (
    <PageHeaderControlsSlotProvider>
      <div
        className={cn(
          "flex flex-col",
          scrollable
            ? "min-h-screen-with-banner relative flex flex-1"
            : "h-full",
        )}
        id="page"
      >
        <header className="sticky top-0 z-50 w-full">
          {isMobile ? (
            <MobileTopBar
              showSidebarTrigger={headerProps.showSidebarTrigger}
              leadingControl={headerProps.leadingControl}
            />
          ) : (
            <PageHeader {...headerProps} container={false} className="top-0" />
          )}
        </header>
        <main
          className={cn(
            "flex flex-1 flex-col",
            scrollable
              ? "min-h-screen-with-banner relative flex"
              : "h-full overflow-hidden",
            withPadding && "p-3",
          )}
        >
          {isMobile && (
            <MobilePageTitle
              title={headerProps.title}
              titleContent={headerProps.titleContent}
              titleTooltip={headerProps.titleTooltip}
              help={headerProps.help}
              itemType={headerProps.itemType}
              actionButtonsLeft={headerProps.actionButtonsLeft}
              actionButtonsRight={headerProps.actionButtonsRight}
              titleBadges={headerProps.titleBadges}
              breadcrumbBadges={headerProps.breadcrumbBadges}
              tabsProps={headerProps.tabsProps}
            />
          )}
          {children}
        </main>
      </div>
    </PageHeaderControlsSlotProvider>
  );
};

export default Page;
