import React from "react";
import { cn } from "@/src/utils/tailwind";
import DocPopup from "@/src/components/layouts/doc-popup";
import { Flex, Text } from "@tremor/react";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useTranslation } from "react-i18next";

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

const NoData = ({ noDataText, children, className }: NoDataProps) => {
  const { t } = useTranslation();
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      className={cn(
        "flex h-3/4 min-h-[9rem] w-full rounded-tremor-default border border-dashed",
        className,
      )}
    >
      <Text className="text-tremor-content">
        {noDataText || t("dashboard.modelLatencies.noData")}
      </Text>
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
    <NoData className={className}>
      {description && <DocPopup description={description} href={href} />}
    </NoData>
  );
}
