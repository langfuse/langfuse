import { cn } from "@/src/utils/tailwind";

export const BigNumber = ({
  className,
  metric,
}: {
  className?: string;
  metric: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center",
        className,
      )}
    >
      <span className="text-center text-6xl font-extrabold tracking-tight">
        {metric}
      </span>
    </div>
  );
};
