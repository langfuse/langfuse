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
        "inline-block max-w-full overflow-hidden text-ellipsis text-nowrap rounded py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {value}
    </div>
  );
}
