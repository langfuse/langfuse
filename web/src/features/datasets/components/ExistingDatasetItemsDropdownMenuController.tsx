import { Slot } from "@radix-ui/react-slot";
import {
  createContext,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { type RouterOutputs } from "@/src/utils/api";

const ExistingDatasetItemsDropdownMenuContext = createContext<{
  isDropdownEnabled: boolean;
  openDropdown: () => void;
} | null>(null);

const PositionOnlyAnchorProxy = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    children: ReactElement;
    openDropdown: () => void;
  }
>(function PositionOnlyAnchorProxy(props, ref) {
  const { children, openDropdown, ...radixTriggerProps } = props;

  return (
    <Slot
      {...radixTriggerProps}
      ref={ref}
      // Radix DropdownMenu has no public positioning-only anchor. Its Trigger
      // currently injects opening behavior through these two handlers, so strip
      // them while retaining its positioning ref and accessibility attributes.
      onPointerDown={undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          openDropdown();
          event.preventDefault();
        }
      }}
    >
      {children}
    </Slot>
  );
});

function ExistingDatasetItemsDropdownMenuAnchor(props: {
  children: ReactElement;
}) {
  const context = useContext(ExistingDatasetItemsDropdownMenuContext);

  if (!context) {
    throw new Error(
      "ExistingDatasetItemsDropdownMenuAnchor must be used within ExistingDatasetItemsDropdownMenuController",
    );
  }

  if (context.isDropdownEnabled) {
    return (
      <DropdownMenuTrigger asChild>
        <PositionOnlyAnchorProxy openDropdown={context.openDropdown}>
          {props.children}
        </PositionOnlyAnchorProxy>
      </DropdownMenuTrigger>
    );
  }

  return <Slot>{props.children}</Slot>;
}

export function ExistingDatasetItemsDropdownMenuController(props: {
  projectId: string;
  datasetItems: RouterOutputs["datasets"]["datasetItemsBasedOnTraceOrObservation"];
  disabled: boolean;
  onOpenDialog: () => void;
  children: (control: {
    Anchor: typeof ExistingDatasetItemsDropdownMenuAnchor;
    openDropdown: () => void;
  }) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasDatasetItems = props.datasetItems.length > 0;
  const isDropdownEnabled = hasDatasetItems && !props.disabled;
  const openDialog = () => {
    setIsOpen(false);
    props.onOpenDialog();
  };
  const openDropdown = () => {
    if (isDropdownEnabled) {
      setIsOpen(true);
    }
  };

  return (
    <ExistingDatasetItemsDropdownMenuContext.Provider
      value={{
        isDropdownEnabled,
        openDropdown,
      }}
    >
      <DropdownMenu open={isDropdownEnabled && isOpen} onOpenChange={setIsOpen}>
        {props.children({
          Anchor: ExistingDatasetItemsDropdownMenuAnchor,
          openDropdown,
        })}
        {isDropdownEnabled ? (
          <DropdownMenuContent align="end">
            {props.datasetItems.map(
              ({ id: datasetItemId, datasetName, datasetId }) => (
                <DropdownMenuItem
                  key={datasetItemId}
                  className="capitalize"
                  asChild
                >
                  <Link
                    href={`/project/${props.projectId}/datasets/${datasetId}/items/${datasetItemId}`}
                  >
                    {datasetName}
                  </Link>
                </DropdownMenuItem>
              ),
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="capitalize" onSelect={openDialog}>
              <PlusIcon size={16} className="mr-2" aria-hidden="true" />
              Add to more datasets
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
    </ExistingDatasetItemsDropdownMenuContext.Provider>
  );
}
