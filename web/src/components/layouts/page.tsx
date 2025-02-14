import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { cn } from "@/src/utils/tailwind";

type PageContainerProps = {
  children: React.ReactNode;
  headerProps: Omit<PageHeaderProps, "container">;
  scrollable?: boolean;
};

const Page = ({
  children,
  headerProps,
  scrollable = false,
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
        className={`flex flex-1 flex-col p-3 ${
          scrollable ? "relative flex min-h-svh" : "h-full overflow-hidden"
        }`}
      >
        {children}
      </main>
    </div>
  );
};

export default Page;
