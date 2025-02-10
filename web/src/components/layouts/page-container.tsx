import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { cn } from "@/src/utils/tailwind";

type PageContainerProps = {
  children: React.ReactNode;
  headerProps: PageHeaderProps;
  scrollable?: boolean;
};

const PageContainer = ({
  children,
  headerProps,
  scrollable = false,
}: PageContainerProps) => {
  return (
    <div className={cn("h-full", !scrollable && "flex flex-col")}>
      <header className="sticky top-0 z-50 w-full">
        <PageHeader {...headerProps} />
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

export default PageContainer;
