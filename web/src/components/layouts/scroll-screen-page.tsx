import { cn } from "@/src/utils/tailwind";

export const ScrollScreenPage: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => {
  return (
    <div className={cn("relative flex min-h-svh flex-1 flex-col pb-3")}>
      {children}
    </div>
  );
};
