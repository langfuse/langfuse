import { JSONView } from "@/src/components/ui/code";
import { cn } from "@/src/utils/tailwind";
import { randomIntFromInterval } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";
import React from "react";

export const IOCell = ({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: unknown;
}) => {
  return (
    <>
      {isLoading  ? (
        <JsonSkeleton className="h-[250px] w-[500px] px-3 py-1" />
      ) : (
        <JSONView json={data} className="h-[250px] w-[500px] overflow-y-auto" />
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
    "h-5 w-full",
    "h-5 w-[400px]",
    "h-5 w-[450px]",
    "h-5 w-[475px]",
  ];

  const generateRandomSize = () =>
    sizingOptions[randomIntFromInterval(0, sizingOptions.length - 1)];

  return (
    <div className={cn("w-[500px] rounded-md border", className)}>
      <div className="flex flex-col gap-1">
        {[...Array<number>(numRows)].map((_) => (
          <>
            <Skeleton className={generateRandomSize()} />
          </>
        ))}
        <br />
      </div>
    </div>
  );
};
