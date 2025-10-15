import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { cn } from "@/src/utils/tailwind";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

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
  const { open: supportDrawerIsOpen } = useSupportDrawer();

  return (
    <div
      className={cn(
        "flex flex-col",
        scrollable ? "relative flex min-h-screen-with-banner flex-1" : "h-full",
      )}
      id="page"
    >
      <header
        className={cn(
          "sticky z-50 w-full",
          supportDrawerIsOpen ? "top-0" : "top-banner-offset", // if the support drawer is open the parent element changes (see layout.tsx) and we need to adjust the top position
        )}
      >
        <PageHeader {...headerProps} container={false} className={"top-0"} />
      </header>
      <main
        className={cn(
          "flex flex-1 flex-col",
          scrollable
            ? "relative flex min-h-screen-with-banner"
            : "h-full overflow-hidden",
          withPadding && "p-3",
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default Page;
