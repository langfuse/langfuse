import { cn } from "@/src/utils/tailwind";

export const FullScreenPage: React.FC<
  React.PropsWithChildren<{
    mobile?: boolean;
    className?: string;
  }>
> = ({ children, mobile = true, className }) => {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden lg:h-[calc(100dvh-1.5rem)]",
        mobile && "h-[calc(100dvh-6rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
};
