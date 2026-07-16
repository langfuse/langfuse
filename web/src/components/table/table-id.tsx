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
        "font-emphasis inline-block max-w-full overflow-hidden rounded py-0.5 text-xs text-nowrap text-ellipsis",
        className,
      )}
    >
      {value}
    </div>
  );
}
