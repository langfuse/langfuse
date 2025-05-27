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
import { AutomationsList } from "./automationsList";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ActiveAutomation } from "@langfuse/shared/src/server";

type ViewState = "list" | "create" | "edit";
import { AutomationForm } from "@/src/features/automations/components/automationForm";

export const AutomationsDrawer = ({ projectId }: { projectId: string }) => {
  const [view, setView] = useState<ViewState>("list");

  const [selectedAutomation, setSelectedAutomation] =
    useState<ActiveAutomation | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  // Handle returning to list view and refreshing data
  const handleReturnToList = () => {
    setView("list");
    setSelectedAutomation(null);
  };

  // Handle editing an automation
  const handleEditAutomation = (automation: ActiveAutomation) => {
    if (!hasAccess) return;
    setSelectedAutomation(automation);
    setView("edit");
  };

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Share2 className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-[85vh] overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl">
          <DrawerHeader className="sticky top-0 z-10 flex flex-row items-center justify-between bg-background px-4 py-2">
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
                <Button
                  variant="outline"
                  onClick={() => setView("create")}
                  disabled={!hasAccess}
                >
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
                automation={
                  view === "edit" && selectedAutomation
                    ? selectedAutomation
                    : undefined
                }
                isEditing={view === "edit"}
              />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
