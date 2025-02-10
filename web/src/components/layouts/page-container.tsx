import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";

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
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-50 w-full">
        <PageHeader {...headerProps} />
      </header>
      <main
        className={`flex-1 p-3 ${scrollable ? "overflow-auto" : "overflow-hidden"}`}
      >
        {children}
      </main>
    </div>
  );
};

export default PageContainer;
