import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { MobileTopBar } from "@/src/components/layouts/mobile-top-bar";
import { MobilePageTitle } from "@/src/components/layouts/mobile-page-title";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { cn } from "@/src/utils/tailwind";

type SettingsContainerProps = {
  children: React.ReactNode;
  headerProps: Omit<PageHeaderProps, "container">;
};

const containerLayoutClassName =
  "lg:mx-auto lg:w-full lg:max-w-screen-lg lg:px-8 xl:max-w-screen-xl 2xl:max-w-[1400px]";

const ContainerPage = ({ children, headerProps }: SettingsContainerProps) => {
  // Same minimal-chrome mobile shell as Page (slim top bar + page-title block),
  // so settings/container pages match the rest of the app on mobile. Desktop is
  // unchanged: the existing container PageHeader renders on `md` and up.
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen-with-banner relative flex flex-1 flex-col">
      <header className="sticky top-0 z-50 w-full">
        {isMobile ? (
          <MobileTopBar
            showSidebarTrigger={headerProps.showSidebarTrigger}
            leadingControl={headerProps.leadingControl}
          />
        ) : (
          <PageHeader {...headerProps} container />
        )}
      </header>
      {isMobile && <MobilePageTitle headerProps={headerProps} />}
      <main
        className={cn(
          "relative flex min-h-0 flex-1 flex-col p-3",
          containerLayoutClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default ContainerPage;
