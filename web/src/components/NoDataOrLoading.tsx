/* eslint-disable @repo/no-style-props */
import React from "react";
import { cn } from "../utils/tailwind";
import DocPopup from "./layouts/doc-popup";
import { Skeleton } from "./ui/skeleton";

interface NoDataOrLoadingProps {
  isLoading: boolean;
  description?: string;
  href?: string;
  className?: string;
}
interface NoDataProps {
  noDataText?: string;
  children?: React.ReactNode;
  className?: string;
}

const NoData = ({
  noDataText = "No data",
  children,
  className,
}: NoDataProps) => {
  return (
    <div
      className={cn(
        "flex h-3/4 min-h-36 w-full items-center justify-center rounded-md border border-dashed",
        className,
      )}
    >
      <p className="text-muted-foreground">{noDataText}</p>
      {children}
    </div>
  );
};

export function NoDataOrLoading({
  isLoading,
  description,
  href,
  className,
}: NoDataOrLoadingProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex h-3/4 min-h-36 w-full items-center justify-center rounded-md",
          className,
        )}
      >
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <NoData noDataText="No data" className={className}>
      {description && <DocPopup description={description} href={href} />}
    </NoData>
  );
}
