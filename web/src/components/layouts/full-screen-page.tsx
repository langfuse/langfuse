import { cn } from "@/src/utils/tailwind";

export const FullScreenPage: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden")}>{children}</div>
  );
};
