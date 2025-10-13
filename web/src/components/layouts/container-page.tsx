import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { cn } from "@/src/utils/tailwind";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

type SettingsContainerProps = {
  children: React.ReactNode;
  headerProps: Omit<PageHeaderProps, "container">;
};

const ContainerPage = ({ children, headerProps }: SettingsContainerProps) => {
  const { open: supportDrawerIsOpen } = useSupportDrawer();

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100svh-var(--banner-height,0px))] flex-1 flex-col",
      )}
    >
      <header
        className={cn(
          "sticky top-[var(--banner-height,0px)] z-50 w-full",
          supportDrawerIsOpen && "top-0",
        )}
      >
        <PageHeader {...headerProps} container />
      </header>
      <main
        className={cn(
          "relative flex min-h-[calc(100svh-var(--banner-height,0px))] flex-1 flex-col p-3 lg:container",
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default ContainerPage;
