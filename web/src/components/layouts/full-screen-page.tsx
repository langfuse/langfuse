import { cn } from "@/src/utils/tailwind";

export const FullScreenPage: React.FC<
  React.PropsWithChildren<{
    mobile?: boolean;
    className?: string;
    customHeight?: string;
  }>
> = ({ children, mobile = true, className, customHeight = "1.5rem" }) => {
  return (
    <div
      className={cn(
        `flex flex-col overflow-hidden lg:h-[calc(100dvh-${customHeight})]`,
        mobile ? "h-[calc(100dvh-6rem)]" : `h-[calc(100dvh-${customHeight})]`,
        className,
      )}
    >
      {children}
    </div>
  );
};
