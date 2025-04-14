import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { X, Plus, Bookmark, Clock } from "lucide-react";
import {
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  Drawer,
  DrawerClose,
} from "@/src/components/ui/drawer";
import { Separator } from "@/src/components/ui/separator";
import { useViewData } from "@/src/components/table/saved-views/hooks/useViewData";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/src/components/ui/command";
import { useViewMutations } from "@/src/components/table/saved-views/hooks/useViewMutations";
import { useViewStore } from "@/src/components/table/saved-views/hooks/useViewStore";
import { cn } from "@/src/utils/tailwind";

interface SavedViewsDrawerProps {
  tableName: string;
  projectId: string;
}

export function SavedViewsDrawer({
  tableName,
  projectId,
}: SavedViewsDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { savedViewList } = useViewData({ tableName });
  const { selectedViewId, setSelectedViewId } = useViewStore();
  const { createMutation, updateMutation, deleteMutation } = useViewMutations();

  // Filter views based on search query

  const handleCreateView = () => {
    // createMutation.mutate({
    //   name: "New View",
    //   tableName,
    // });
  };

  const handleUpdateView = (updatedView: { name: string }) => {
    // updateMutation.mutate({
    //   projectId,
    //   id: selectedViewId,
    //   ...updatedView,
    // });
  };

  const handleDeleteView = (viewId: string) => {
    deleteMutation.mutate({
      projectId,
      savedViewId: viewId,
    });
  };

  return (
    <Drawer modal={false}>
      <DrawerTrigger asChild>
        <Button variant="outline" title="Saved views">
          <span>Saved Views</span>
          <div className="ml-1 rounded-sm bg-input px-1 text-xs">
            {savedViewList.length}
          </div>
        </Button>
      </DrawerTrigger>
      <DrawerContent overlayClassName="bg-primary/10">
        <div className="mx-auto w-full overflow-y-auto md:max-h-full">
          <div className="sticky top-0 z-10">
            <DrawerHeader className="flex flex-row items-center justify-between rounded-sm bg-background px-3 py-2">
              <DrawerTitle>Saved Views</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="outline" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <Separator />
          </div>

          <Command className="rounded-none border-none shadow-none">
            <CommandInput
              placeholder="Search saved views..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-12 border-none focus:ring-0"
            />
            <CommandList>
              <CommandEmpty>No saved views found</CommandEmpty>
              <CommandGroup>
                {savedViewList.map((view) => (
                  <CommandItem
                    key={view.id}
                    onSelect={() => setSelectedViewId(view.id)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50",
                      selectedViewId === view.id && "bg-muted/30",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{view.name}</span>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {new Date(view.createdAt).toLocaleDateString()}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          <Separator />

          {/* Create new saved view button */}
          <div className="p-3">
            <Button
              onClick={handleCreateView}
              variant="outline"
              className="w-full justify-start"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New View
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
