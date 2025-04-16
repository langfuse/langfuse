import { Button } from "@/src/components/ui/button";
import { X, Plus, Bookmark, Clock, ChevronDown } from "lucide-react";
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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  type VisibilityState,
  type ColumnOrderState,
} from "@tanstack/react-table";
import { OrderByState, type FilterState } from "@langfuse/shared";
import { useState } from "react";

interface SavedViewsDrawerProps {
  tableName: string;
  projectId: string;
  currentState: {
    orderBy: OrderByState;
    filters: FilterState;
    columnOrder: ColumnOrderState;
    columnVisibility: VisibilityState;
    searchQuery: string;
  };
  setOrderBy?: (value: OrderByState) => void;
  setFilters?: (value: FilterState) => void;
  setColumnOrder?: (value: ColumnOrderState) => void;
  setColumnVisibility?: (value: VisibilityState) => void;
  setSearchQuery?: (value: string) => void;
}

function formatOrderBy(orderBy?: OrderByState) {
  return orderBy?.column ? `${orderBy.column} ${orderBy.order}` : "none";
}

export function SavedViewsDrawer({
  tableName,
  projectId,
  currentState,
  setOrderBy,
  setFilters,
  setColumnOrder,
  setColumnVisibility,
  setSearchQuery,
}: SavedViewsDrawerProps) {
  const [searchQuery, setSearchQueryLocal] = useState("");
  const { selectedViewId, setSelectedViewId } = useViewStore({
    setOrderBy,
    setFilters,
    setColumnOrder,
    setColumnVisibility,
    setSearchQuery,
    tableName,
    projectId,
  });
  const { savedViewList } = useViewData({ tableName, projectId });
  const { createMutation, updateMutation, deleteMutation } = useViewMutations();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const selectedViewName = savedViewList?.find(
    (view) => view.id === selectedViewId,
  )?.name;

  const handleCreateView = () => {
    createMutation.mutate({
      name: newViewName || "New View",
      tableName,
      projectId,
      orderBy: currentState.orderBy,
      filters: currentState.filters,
      columnOrder: currentState.columnOrder,
      columnVisibility: currentState.columnVisibility,
      searchQuery: currentState.searchQuery,
    });

    setNewViewName("");
    setIsCreateDialogOpen(false);
  };

  const handleUpdateView = (updatedView: { name: string }) => {
    if (!selectedViewId) return;
    updateMutation.mutate({
      projectId,
      name: updatedView.name,
      id: selectedViewId,
      tableName,
      orderBy: currentState.orderBy,
      filters: currentState.filters,
      columnOrder: currentState.columnOrder,
      columnVisibility: currentState.columnVisibility,
      searchQuery: currentState.searchQuery,
    });
  };

  const handleDeleteView = (viewId: string) => {
    deleteMutation.mutate({
      projectId,
      savedViewId: viewId,
    });
  };

  return (
    <>
      <Drawer modal={false}>
        <DrawerTrigger asChild>
          <Button variant="outline" title={selectedViewName ?? "Saved views"}>
            <span>{selectedViewName ?? "Saved Views"}</span>
            {selectedViewId ? (
              <ChevronDown className="ml-1 h-4 w-4" />
            ) : (
              <div className="ml-1 rounded-sm bg-input px-1 text-xs">
                {savedViewList?.length ?? 0}
              </div>
            )}
          </Button>
        </DrawerTrigger>
        <DrawerContent overlayClassName="bg-primary/10">
          <div className="mx-auto h-[80svh] w-full overflow-y-auto">
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

            <Command className="h-fit rounded-none border-none pb-1 shadow-none">
              <CommandInput
                placeholder="Search saved views..."
                value={searchQuery}
                onValueChange={setSearchQueryLocal}
                className="h-12 border-none focus:ring-0"
              />
              <CommandList>
                <CommandEmpty>No saved views found</CommandEmpty>
                <CommandGroup className="pb-0">
                  {savedViewList?.map((view) => (
                    <CommandItem
                      key={view.id}
                      onSelect={() => setSelectedViewId(view.id)}
                      className={cn(
                        "mt-1 flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50",
                        selectedViewId === view.id && "bg-muted font-medium",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{view.name}</span>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Avatar>
                          <AvatarImage src="https://github.com/shadcn.png" />
                        </Avatar>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>

            <Separator />

            <div className="px-0 py-2">
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                variant="ghost"
                className="w-full justify-start"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New View
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Create View Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="view-name">View Name</Label>
            <Input
              id="view-name"
              placeholder="My Saved View"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="mt-2"
              autoFocus
            />

            <div className="mt-4 text-sm text-muted-foreground">
              <p>This will save the current:</p>
              <ul className="mt-2 list-disc pl-5">
                <li>
                  Column arrangement ({currentState.columnOrder.length} columns)
                </li>
                <li>Filters ({currentState.filters.length} active)</li>
                <li>
                  Sort order ({formatOrderBy(currentState.orderBy)} criteria)
                </li>
                {currentState.searchQuery && <li>Search term</li>}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateView}
              disabled={createMutation.isLoading}
            >
              {createMutation.isLoading ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
