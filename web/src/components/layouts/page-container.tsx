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
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-50 w-full">
        <PageHeader {...headerProps} />
      </header>
      <main
        className={`flex h-full flex-1 flex-col p-3 ${scrollable ? "overflow-auto" : "overflow-hidden"}`}
      >
        {children}
      </main>
    </div>
  );
};

export default PageContainer;
