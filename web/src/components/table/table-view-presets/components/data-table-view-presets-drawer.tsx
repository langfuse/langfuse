import { Button } from "@/src/components/ui/button";
import {
  X,
  Plus,
  ChevronDown,
  Link,
  MoreVertical,
  Pen,
  Lock,
} from "lucide-react";
import {
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  Drawer,
  DrawerClose,
} from "@/src/components/ui/drawer";
import { Separator } from "@/src/components/ui/separator";
import { useViewData } from "@/src/components/table/table-view-presets/hooks/useViewData";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/src/components/ui/command";
import { useViewMutations } from "@/src/components/table/table-view-presets/hooks/useViewMutations";
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
  DialogBody,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import {
  type VisibilityState,
  type ColumnOrderState,
} from "@tanstack/react-table";
import {
  type OrderByState,
  type FilterState,
  type TableViewPresetTableName,
  type TableViewPresetDomain,
} from "@langfuse/shared";
import { useMemo, useState } from "react";
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
import { z } from "zod/v4";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

interface TableViewPresetsDrawerProps {
  viewConfig: {
    tableName: TableViewPresetTableName;
    projectId: string;
    controllers: {
      selectedViewId: string | null;
      handleSetViewId: (viewId: string | null) => void;
      applyViewState: (viewData: TableViewPresetDomain) => void;
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

export function TableViewPresetsDrawer({
  viewConfig,
  currentState,
}: TableViewPresetsDrawerProps) {
  const [searchQuery, setSearchQueryLocal] = useState("");
  const { tableName, projectId, controllers } = viewConfig;
  const { handleSetViewId, applyViewState, selectedViewId } = controllers;
  const { TableViewPresetsList } = useViewData({ tableName, projectId });
  const {
    createMutation,
    updateConfigMutation,
    updateNameMutation,
    deleteMutation,
    generatePermalinkMutation,
  } = useViewMutations({ handleSetViewId });
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1) })),
    defaultValues: {
      name: "",
    },
  });

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState<boolean>(false);
  const [dropdownId, setDropdownId] = useState<string | null>(null);

  const selectedViewName = TableViewPresetsList?.find(
    (view) => view.id === selectedViewId,
  )?.name;

  const allViewNames = useMemo(
    () => TableViewPresetsList?.map((view) => ({ value: view.name })) ?? [],
    [TableViewPresetsList],
  );

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: allViewNames,
    form,
    errorMessage: "View name already exists.",
  });

  const handleSelectView = async (viewId: string) => {
    capture("saved_views:view_selected", {
      tableName,
      viewId,
    });

    handleSetViewId(viewId);
    try {
      const fetchedViewData = await utils.TableViewPresets.getById.fetch({
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

  const handleCreateView = (createdView: { name: string }) => {
    capture("saved_views:create", {
      tableName,
      name: createdView.name,
    });

    createMutation.mutate({
      name: createdView.name,
      tableName,
      projectId,
      orderBy: currentState.orderBy,
      filters: currentState.filters,
      columnOrder: currentState.columnOrder,
      columnVisibility: currentState.columnVisibility,
      searchQuery: currentState.searchQuery,
    });

    setIsCreateDialogOpen(false);
  };

  const handleUpdateViewConfig = (updatedView: { name: string }) => {
    if (!selectedViewId) return;

    capture("saved_views:update_config", {
      tableName,
      viewId: selectedViewId,
      name: updatedView.name,
    });

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
    capture("saved_views:update_name", {
      tableName,
      viewId: updatedView.id,
      name: updatedView.name,
    });

    updateNameMutation.mutate({
      id: updatedView.id,
      name: updatedView.name,
      tableName,
      projectId,
    });
  };

  const onSubmit = (id?: string) => (data: { name: string }) => {
    console.log("submitting");
    if (id) {
      handleUpdateViewName({ id, name: data.name });
      setIsEditPopoverOpen(false);
      setDropdownId(null);
    } else {
      console.log("Creating view");
      handleCreateView({ name: data.name });
    }
  };

  const handleDeleteView = async (viewId: string) => {
    capture("saved_views:delete", {
      tableName,
      viewId,
    });

    await deleteMutation.mutateAsync({
      projectId,
      tableViewPresetsId: viewId,
    });
  };

  const handleGeneratePermalink = (viewId: string) => {
    capture("saved_views:permalink_generate", {
      tableName,
      viewId,
    });

    if (window.location.origin) {
      generatePermalinkMutation.mutate({
        viewId,
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
  };

  return (
    <>
      <Drawer
        onOpenChange={(open) => {
          if (open) {
            capture("saved_views:drawer_open", { tableName });
          } else {
            capture("saved_views:drawer_close", { tableName });
          }
        }}
      >
        <DrawerTrigger asChild>
          <Button variant="outline" title={selectedViewName ?? "Table View"}>
            <span>{selectedViewName ?? "Table View"}</span>
            {selectedViewId ? (
              <ChevronDown className="ml-1 h-4 w-4" />
            ) : (
              <div className="ml-1 rounded-sm bg-input px-1 text-xs">
                {TableViewPresetsList?.length ?? 0}
              </div>
            )}
          </Button>
        </DrawerTrigger>
        <DrawerContent overlayClassName="bg-primary/10">
          <div className="mx-auto h-[80svh] w-full overflow-y-auto">
            <div className="sticky top-0 z-10">
              <DrawerHeader className="flex flex-row items-center justify-between rounded-sm bg-background px-3 py-2">
                <DrawerTitle className="flex flex-row items-center gap-1">
                  Saved Table Views{" "}
                  <a
                    href="https://github.com/orgs/langfuse/discussions/4657"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center"
                    title="Saving table view presets is currently in beta. Click here to provide feedback!"
                  >
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Beta
                    </span>
                  </a>
                </DrawerTitle>
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
                placeholder="Search saved table views..."
                value={searchQuery}
                onValueChange={setSearchQueryLocal}
                className="h-12 border-none focus:ring-0"
              />
              <CommandList>
                <CommandEmpty>No saved table views found</CommandEmpty>
                <CommandGroup className="pb-0">
                  {TableViewPresetsList?.map((view) => (
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
                            className={cn(
                              "w-fit pl-0 text-xs",
                              hasWriteAccess
                                ? "text-primary-accent"
                                : "text-muted-foreground",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateViewConfig({
                                name: view.name,
                              });
                            }}
                            disabled={!hasWriteAccess}
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
                            handleGeneratePermalink(view.id);
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
                                    capture("saved_views:update_form_open", {
                                      tableName,
                                      viewId: view.id,
                                    });
                                  } else {
                                    setDropdownId(null);
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    disabled={!hasWriteAccess}
                                  >
                                    {hasWriteAccess ? (
                                      <Pen className="mr-2 h-4 w-4" />
                                    ) : (
                                      <Lock className="mr-2 h-4 w-4" />
                                    )}
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
                                          disabled={
                                            !!form.formState.errors.name
                                          }
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
                                scope="TableViewPresets:CUD"
                                entityToDeleteName="saved view"
                                executeDeleteMutation={async () => {
                                  await handleDeleteView(view.id);
                                }}
                                isDeleteMutationLoading={
                                  deleteMutation.isLoading
                                }
                                invalidateFunc={() => {
                                  utils.TableViewPresets.invalidate();
                                }}
                                captureDeleteOpen={() =>
                                  capture("saved_views:delete_form_open", {
                                    tableName,
                                    viewId: view.id,
                                  })
                                }
                                captureDeleteSuccess={() => {}}
                              />
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Avatar>
                            <AvatarImage
                              src={view.createdByUser?.image ?? undefined}
                              alt={view.createdByUser?.name ?? "User Avatar"}
                            />
                            <AvatarFallback className="bg-tertiary">
                              {view.createdByUser?.name
                                ? view.createdByUser?.name
                                    .split(" ")
                                    .map((word) => word[0])
                                    .slice(0, 2)
                                    .concat("")
                                : null}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>

            <Separator />

            <div className="p-2">
              <Button
                onClick={() => {
                  setIsCreateDialogOpen(true);
                  capture("saved_views:create_form_open", { tableName });
                }}
                variant="ghost"
                className="w-full justify-start px-1"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New View
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Create View Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            form.reset({ name: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current Table View</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit())}
              className="space-y-4"
            >
              <DialogBody>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>View name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-4 text-sm text-muted-foreground">
                  <p>This will save the current:</p>
                  <ul className="mt-2 list-disc pl-5">
                    <li>
                      Column arrangement ({currentState.columnOrder.length}{" "}
                      columns)
                    </li>
                    <li>Filters ({currentState.filters.length} active)</li>
                    <li>
                      Sort order ({formatOrderBy(currentState.orderBy)}{" "}
                      criteria)
                    </li>
                    {currentState.searchQuery && <li>Search term</li>}
                  </ul>
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isLoading ||
                    !!form.formState.errors.name ||
                    !hasWriteAccess
                  }
                >
                  {!hasWriteAccess && <Lock className="mr-2 h-4 w-4" />}
                  {createMutation.isLoading ? "Saving..." : "Save View"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
