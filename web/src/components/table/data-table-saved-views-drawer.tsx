import { Button } from "@/src/components/ui/button";
import { X, Plus, ChevronDown, Link, MoreVertical, Pen } from "lucide-react";
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
import { cn } from "@/src/utils/tailwind";
import { Avatar, AvatarImage } from "@/src/components/ui/avatar";
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
import {
  type OrderByState,
  type FilterState,
  type SavedViewTableName,
  type SavedViewDomain,
} from "@langfuse/shared";
import { useState } from "react";
import {
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DropdownMenu } from "@/src/components/ui/dropdown-menu";
import { DropdownMenuContent } from "@/src/components/ui/dropdown-menu";
import { DeleteButton } from "@/src/components/deleteButton";
import { api } from "@/src/utils/api";
import { Popover, PopoverContent } from "@/src/components/ui/popover";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
interface SavedViewsDrawerProps {
  viewConfig: {
    tableName: SavedViewTableName;
    projectId: string;
    controllers: {
      selectedViewId: string | null;
      handleSetViewId: (viewId: string | null) => void;
      applyViewState: (viewData: SavedViewDomain) => void;
    };
  };
  currentState: {
    orderBy: OrderByState;
    filters: FilterState;
    columnOrder: ColumnOrderState;
    columnVisibility: VisibilityState;
    searchQuery: string;
  };
}

function formatOrderBy(orderBy?: OrderByState) {
  return orderBy?.column ? `${orderBy.column} ${orderBy.order}` : "none";
}

export function SavedViewsDrawer({
  viewConfig,
  currentState,
}: SavedViewsDrawerProps) {
  const [searchQuery, setSearchQueryLocal] = useState("");
  const { tableName, projectId, controllers } = viewConfig;
  const { handleSetViewId, applyViewState, selectedViewId } = controllers;
  const { savedViewList } = useViewData({ tableName, projectId });
  const {
    createMutation,
    updateConfigMutation,
    updateNameMutation,
    deleteMutation,
    generatePermalinkMutation,
  } = useViewMutations({ handleSetViewId });
  const utils = api.useUtils();

  const form = useForm<{ name: string }>({
    resolver: zodResolver(z.object({ name: z.string() })),
  });

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState<boolean>(false);
  const [dropdownId, setDropdownId] = useState<string | null>(null);

  const selectedViewName = savedViewList?.find(
    (view) => view.id === selectedViewId,
  )?.name;

  const handleSelectView = async (viewId: string) => {
    handleSetViewId(viewId);
    try {
      const fetchedViewData = await utils.savedViews.getById.fetch({
        projectId,
        viewId,
      });

      if (fetchedViewData) {
        applyViewState(fetchedViewData);
      }
    } catch (error) {
      showErrorToast(
        "Failed to apply view selection",
        "Please try again",
        "WARNING",
      );
    }
  };

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

  const handleUpdateViewConfig = (updatedView: { name: string }) => {
    if (!selectedViewId) return;
    updateConfigMutation.mutate({
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

  const handleUpdateViewName = (updatedView: { id: string; name: string }) => {
    updateNameMutation.mutate({
      id: updatedView.id,
      name: updatedView.name,
      tableName,
      projectId,
    });
  };

  const onSubmit = (id: string) => (data: { name: string }) => {
    handleUpdateViewName({ id, name: data.name });
    setIsEditPopoverOpen(false);
    setDropdownId(null);
  };

  const handleDeleteView = async (viewId: string) => {
    await deleteMutation.mutateAsync({
      projectId,
      savedViewId: viewId,
    });
  };

  return (
    <>
      <Drawer>
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
                      onSelect={() => handleSelectView(view.id)}
                      className={cn(
                        "group mt-1 flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50",
                        selectedViewId === view.id && "bg-muted font-medium",
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{view.name}</span>
                        {view.id === selectedViewId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-fit pl-0 text-xs text-primary-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateViewConfig({
                                name: view.name,
                              });
                            }}
                          >
                            Update
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-row gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.location.origin) {
                              generatePermalinkMutation.mutate({
                                viewId: view.id,
                                projectId,
                                tableName,
                                baseUrl: window.location.origin,
                              });
                            } else {
                              showErrorToast(
                                "Failed to generate permalink",
                                "Please reach out to langfuse support and report this issue.",
                                "WARNING",
                              );
                            }
                          }}
                          className="w-4 opacity-0 group-hover:opacity-100 peer-data-[state=open]:opacity-100"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                        <DropdownMenu
                          open={dropdownId === view.id}
                          onOpenChange={(open) => {
                            setDropdownId(open ? view.id : null);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="flex flex-col [&>*]:w-full [&>*]:justify-start">
                            <DropdownMenuItem asChild>
                              <Popover
                                key={view.id + "-edit"}
                                open={isEditPopoverOpen}
                                onOpenChange={(open) => {
                                  setIsEditPopoverOpen(open);
                                  if (open) {
                                    form.reset({ name: view.name });
                                  } else {
                                    setDropdownId(null);
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="space-x-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <Pen className="ml-3 mr-2 h-4 w-4" />
                                    Edit
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <h2 className="text-md mb-3 font-semibold">
                                    Edit
                                  </h2>
                                  <Form {...form}>
                                    <form
                                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                                      onSubmit={form.handleSubmit(
                                        onSubmit(view.id),
                                      )}
                                      className="space-y-2"
                                    >
                                      <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>View name</FormLabel>
                                            <FormControl>
                                              <Input
                                                defaultValue={view.name}
                                                {...field}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />

                                      <div className="flex w-full justify-end">
                                        <Button
                                          type="submit"
                                          loading={updateNameMutation.isLoading}
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </form>
                                  </Form>
                                </PopoverContent>
                              </Popover>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <DeleteButton
                                itemId={view.id}
                                projectId={projectId}
                                scope="savedViews:CUD"
                                entityToDeleteName="saved view"
                                executeDeleteMutation={async () => {
                                  await handleDeleteView(view.id);
                                }}
                                isDeleteMutationLoading={
                                  deleteMutation.isLoading
                                }
                                invalidateFunc={() => {
                                  utils.savedViews.invalidate();
                                }}
                                captureDeleteOpen={() => {}}
                                captureDeleteSuccess={() => {}}
                              />
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Avatar>
                            <AvatarImage src={view.createdByUser.image} />
                          </Avatar>
                        </div>
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
