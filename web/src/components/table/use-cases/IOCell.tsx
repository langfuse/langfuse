import { JSONView } from "@/src/components/ui/code";
import { cn } from "@/src/utils/tailwind";
import { randomIntFromInterval } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";
import React from "react";

export const IOCell = ({
  isLoading,
  data,
  height = "l",
}: {
  isLoading: boolean;
  data: unknown;
  height?: "s" | "m" | "l";
}) => {
  const heightTw = {
    s: "h-[40px]",
    m: "h-[100px]",
    l: "h-[250px]",
  };

  return (
    <>
      {isLoading ? (
        <JsonSkeleton className={cn("w-[400px] px-3 py-1", heightTw[height])} />
      ) : (
        <JSONView
          json={data}
          className={cn("w-[400px] overflow-y-auto", heightTw[height])}
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
    "h-5 w-full",
    "h-5 w-[400px]",
    "h-5 w-[450px]",
    "h-5 w-[475px]",
  ];

  const generateRandomSize = () =>
    sizingOptions[randomIntFromInterval(0, sizingOptions.length - 1)];

  return (
    <div className={cn("w-[400px] rounded-md border", className)}>
      <div className="flex flex-col gap-1">
        {[...Array<number>(numRows)].map((_, i) => (
          <Skeleton className={generateRandomSize()} key={i} />
        ))}
        <br />
      </div>
    </div>
  );
};
