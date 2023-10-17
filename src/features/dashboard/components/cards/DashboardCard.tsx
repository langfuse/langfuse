import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";
import { Loader } from "lucide-react";
import { type ReactNode } from "react";

export type DashboardCardProps = {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  isLoading: boolean;
  children?: ReactNode;
  headerChildren?: ReactNode;
  cardContentClassName?: string;
};

export const DashboardCard = ({
  className,
  title,
  description,
  isLoading,
  children,
  headerChildren,
  cardContentClassName,
}: DashboardCardProps) => {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="relative">
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : undefined}
        {headerChildren ?? undefined}
        {isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent
        className={cn("flex flex-1 flex-col gap-4", cardContentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
};
