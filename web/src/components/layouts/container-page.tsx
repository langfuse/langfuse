import PageHeader, {
  type PageHeaderProps,
} from "@/src/components/layouts/page-header";
import { cn } from "@/src/utils/tailwind";

type SettingsContainerProps = {
  children: React.ReactNode;
  headerProps: Omit<PageHeaderProps, "container">;
};

const containerLayoutClassName =
  "lg:mx-auto lg:w-full lg:max-w-screen-lg lg:px-8 xl:max-w-screen-xl 2xl:max-w-[1400px]";

const ContainerPage = ({ children, headerProps }: SettingsContainerProps) => {
  return (
    <div
      className={cn("min-h-screen-with-banner relative flex flex-1 flex-col")}
    >
      <header className="sticky top-0 z-50 w-full">
        <PageHeader {...headerProps} container />
      </header>
      <main
        className={cn(
          "min-h-screen-with-banner relative flex flex-1 flex-col p-3",
          containerLayoutClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default ContainerPage;
