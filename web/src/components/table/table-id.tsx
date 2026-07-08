import { cn } from "@/src/utils/tailwind";

export default function TableIdOrName({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <div
      title={value}
      className={cn(
        "inline-block max-w-full overflow-hidden rounded py-0.5 text-xs font-semibold text-nowrap text-ellipsis",
        className,
      )}
    >
      {value}
    </div>
  );
}
