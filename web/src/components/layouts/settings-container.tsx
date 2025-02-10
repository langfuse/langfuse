import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { cn } from "@/src/utils/tailwind";

type SettingsContainerProps = {
  children: React.ReactNode;
  headerProps: Omit<PageHeaderProps, "container">;
};

const SettingsContainer = ({
  children,
  headerProps,
}: SettingsContainerProps) => {
  return (
    <div className={cn("h-full")}>
      <header className="sticky top-0 z-50 w-full">
        <PageHeader {...headerProps} container />
      </header>
      <main className="relative flex min-h-svh flex-1 flex-col p-3">
        {children}
      </main>
    </div>
  );
};

export default SettingsContainer;
