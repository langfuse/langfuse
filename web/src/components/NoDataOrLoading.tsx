import React from "react";
import { cn } from "@/src/utils/tailwind";
import DocPopup from "@/src/components/layouts/doc-popup";
import { Flex, Text } from "@tremor/react";
import { Skeleton } from "@/src/components/ui/skeleton";

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
    <Flex
      alignItems="center"
      justifyContent="center"
      className={cn(
        "flex h-3/4 min-h-[9rem] w-full rounded-tremor-default border border-dashed",
        className,
      )}
    >
      <Text className="text-tremor-content">{noDataText}</Text>
      {children}
    </Flex>
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
      <Flex
        alignItems="center"
        justifyContent="center"
        className={cn(
          "flex h-3/4 min-h-[9rem] w-full rounded-tremor-default",
          className,
        )}
      >
        <Skeleton className="h-full w-full" />
      </Flex>
    );
  }

  return (
    <NoData noDataText="No data" className={className}>
      {description && <DocPopup description={description} href={href} />}
    </NoData>
  );
}
