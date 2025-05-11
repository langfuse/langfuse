import React from "react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { JobConfigState } from "@langfuse/shared";
import { Edit } from "lucide-react";
import { type TriggerConfiguration } from "@prisma/client";

interface AutomationsListProps {
  projectId: string;
  onEditAutomation?: (automation: TriggerConfiguration) => void;
}

export const AutomationsList = ({
  projectId,
  onEditAutomation,
}: AutomationsListProps) => {
  const { data: automations, isLoading } =
    api.automations.getAutomations.useQuery({
      projectId,
    });

  if (isLoading) {
    return <div className="py-4 text-center">Loading automations...</div>;
  }

  if (!automations || automations.length === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        No automations configured. Create your first automation to automate
        workflows.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {automations.map((automation) => (
        <Card key={automation.id} className="relative">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">
                  {automation.description || "Unnamed Automation"}
                </CardTitle>
                <CardDescription className="mt-1 flex items-center gap-2 text-xs">
                  {automation.status === JobConfigState.ACTIVE ? (
                    <Badge
                      variant="outline"
                      className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50"
                    >
                      Active
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50"
                    >
                      Inactive
                    </Badge>
                  )}
                  <span>
                    Event source:{" "}
                    <span className="font-mono text-xs">
                      {automation.eventSource}
                    </span>
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {automation.lastFiredAt && (
                  <div className="text-xs text-muted-foreground">
                    Last triggered{" "}
                    {formatDistanceToNow(new Date(automation.lastFiredAt), {
                      addSuffix: true,
                    })}
                  </div>
                )}
                {onEditAutomation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onEditAutomation(automation)}
                  >
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="text-sm">
              <p>
                <strong>Filter:</strong>{" "}
                {automation.filter
                  ? JSON.stringify(JSON.parse(automation.filter as string))
                  : "No filter"}
              </p>
              <p className="mt-2">
                <strong>Sampling:</strong>{" "}
                {automation.sampling.toNumber() * 100}%
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
