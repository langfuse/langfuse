import React, { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/src/components/ui/drawer";
import { Button } from "@/src/components/ui/button";
import { Share2, Plus, X, ArrowLeft } from "lucide-react";
import { api } from "@/src/utils/api";
import { AutomationsList } from "./automationsList";
import { AutomationForm } from "./automationForm";
import { type TriggerConfiguration } from "@prisma/client";

type ViewState = "list" | "create" | "edit";

export const AutomationsDrawer = ({ projectId }: { projectId: string }) => {
  const { data: automations, refetch } =
    api.automations.getAutomations.useQuery({
      projectId,
    });
  const [view, setView] = useState<ViewState>("list");
  const [selectedAutomation, setSelectedAutomation] =
    useState<TriggerConfiguration | null>(null);

  // Handle returning to list view and refreshing data
  const handleReturnToList = () => {
    setView("list");
    setSelectedAutomation(null);
    void refetch();
  };

  // Handle editing an automation
  const handleEditAutomation = (automation: TriggerConfiguration) => {
    setSelectedAutomation(automation);
    setView("edit");
  };

  return (
    <Drawer modal={false}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Share2 className="h-4 w-4" />
          {automations && automations.length > 0 && (
            <div className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 py-0.5 text-xs text-white">
              {automations.length}
            </div>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent overlayClassName="bg-primary/10">
        <div className="mx-auto w-full max-w-4xl">
          <DrawerHeader className="flex flex-row items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              {view !== "list" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleReturnToList}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <DrawerTitle>
                {view === "list"
                  ? "Automations"
                  : view === "create"
                    ? "New Automation"
                    : "Edit Automation"}
              </DrawerTitle>
            </div>
            <div className="flex gap-2">
              {view === "list" && (
                <Button variant="outline" onClick={() => setView("create")}>
                  <Plus className="h-4 w-4" />
                  New Automation
                </Button>
              )}
              <DrawerClose asChild>
                <Button variant="outline" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="p-4">
            {view === "list" ? (
              <AutomationsList
                projectId={projectId}
                onEditAutomation={handleEditAutomation}
              />
            ) : (
              <AutomationForm
                projectId={projectId}
                onSuccess={handleReturnToList}
                onCancel={handleReturnToList}
                automation={view === "edit" ? selectedAutomation : undefined}
                isEditing={view === "edit"}
              />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
