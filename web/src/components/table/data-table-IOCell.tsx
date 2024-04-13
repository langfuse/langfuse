import { JSONView } from "@/src/components/ui/code";
import { cn } from "@/src/utils/tailwind";
import { randomIntFromInterval } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";
import React from "react";

export const IOCell = ({
  data,
  isLoading = false,
  className,
}: {
  data: unknown;
  isLoading?: boolean;
  className?: string;
}) => {
  return (
    <>
      {isLoading ? (
        <JsonSkeleton className="h-full w-[400px] overflow-hidden px-2 py-1" />
      ) : (
        <JSONView
          json={data}
          className={cn(
            "h-full w-[400px] self-stretch overflow-y-auto rounded-sm ",
            className,
          )}
          codeClassName="py-1 px-2"
        />
      )}
    </>
  );
};

export const JsonSkeleton = ({
  className,
  numRows = 10,
}: {
  numRows?: number;
  className?: string;
}) => {
  const sizingOptions = [
    "h-4 w-full",
    "h-4 w-[400px]",
    "h-4 w-[450px]",
    "h-4 w-[475px]",
  ];

  const generateRandomSize = () =>
    sizingOptions[randomIntFromInterval(0, sizingOptions.length - 1)];

  return (
    <div className={cn("w-[400px] rounded-md border", className)}>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-full" />
        {[...Array<number>(numRows)].map((_, i) => (
          <Skeleton className={generateRandomSize()} key={i} />
        ))}
        <br />
      </div>
    </div>
  );
};
