import { cn } from "@/src/utils/tailwind";

export const FullScreenPage: React.FC<
  React.PropsWithChildren<{
    mobile?: boolean;
    className?: string;
    lgHeight?: string;
    mobileHeight?: string;
  }>
> = ({
  children,
  mobile = true,
  className,
  lgHeight = "lg:h-[calc(100dvh-1.5rem)]",
  mobileHeight = "h-[calc(100dvh-6rem)]",
}) => {
  return (
    <div
      className={cn(
        `flex flex-col overflow-hidden ${lgHeight}`,
        mobile && mobileHeight,
        className,
      )}
    >
      {children}
    </div>
  );
};
