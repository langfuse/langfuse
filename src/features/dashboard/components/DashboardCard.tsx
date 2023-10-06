import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { Loader } from "lucide-react";
import { type ReactNode } from "react";

export type DashboardCardProps = {
  title: string;
  description?: string;
  isLoading: boolean;
  children: ReactNode;
};

export const DashboardCard = ({
  title,
  description,
  isLoading,
  children,
}: DashboardCardProps) => {
  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : undefined}
        {isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="h-80">{children}</CardContent>
    </Card>
  );
};
