import { cn } from "@/src/utils/tailwind";

export const BigNumber = ({
  className,
  metric,
  unit,
}: {
  className?: string;
  metric: React.ReactNode;
  unit?: string;
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
      {unit && (
        <span className="mt-2 text-muted-foreground text-sm">{unit}</span>
      )}
    </div>
  );
};
