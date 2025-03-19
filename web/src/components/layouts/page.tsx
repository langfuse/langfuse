import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
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
  return (
    <div
      className={cn(
        "flex flex-col",
        scrollable ? "relative flex min-h-svh flex-1" : "h-full",
      )}
    >
      <header className="sticky top-0 z-50 w-full">
        <PageHeader {...headerProps} container={false} />
      </header>
      <main
        className={cn(
          "flex flex-1 flex-col",
          scrollable ? "relative flex min-h-svh" : "h-full overflow-hidden",
          withPadding && "p-3",
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default Page;
