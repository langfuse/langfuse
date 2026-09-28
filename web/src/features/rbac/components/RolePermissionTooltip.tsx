import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Info } from "lucide-react";
import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  RolePermissionList,
  rolePermissionCount,
  rolePermissionNoun,
} from "@/src/features/rbac/components/RolePermissionList";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

const ActiveRoleContext = createContext<Dispatch<
  SetStateAction<SystemRole | null>
> | null>(null);
const ActiveRoleValueContext = createContext<SystemRole | null>(null);

/**
 * RolePermissionTooltip shows a role's granted permissions in a hover tooltip to
 * the left of its trigger (an info-icon button by default; pass `trigger` to
 * supply a custom one). Inside a RolePermissionTooltipGroup the icon hover opens
 * it and it closes once the pointer is over neither the icon nor the tooltip.
 * `emptyStateComment` replaces the list for roles that grant nothing (NONE).
 */
export const RolePermissionTooltip = ({
  role,
  emptyStateComment,
  trigger,
}: {
  role: SystemRole;
  emptyStateComment?: string;
  trigger?: ReactNode;
}) => {
  const def = systemRoleAccessRights[role];
  const Icon = roleIcons[role];
  const showEmptyStateComment =
    emptyStateComment !== undefined && rolePermissionCount(role) === 0;

  const setActiveRole = useContext(ActiveRoleContext);
  const activeRole = useContext(ActiveRoleValueContext);
  const controlled = setActiveRole ? { open: activeRole === role } : {};
  const scrollUnlockRef = useDialogScrollUnlock();

  return (
    <Tooltip delayDuration={0} {...controlled}>
      <TooltipTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            data-role-permission-anchor={role}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerEnter={() => setActiveRole?.(role)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            aria-label={`View ${def.name} permissions`}
            className="text-muted-foreground hover:bg-background hover:text-foreground ml-auto flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full opacity-0 group-hover:opacity-100 group-data-highlighted:opacity-100 focus-visible:opacity-100"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent
        side="left"
        collisionPadding={20}
        data-role-permission-anchor={role}
        className="flex max-h-(--radix-tooltip-content-available-height) max-w-[min(28rem,var(--radix-tooltip-content-available-width))] flex-col p-0"
      >
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-base font-bold">{def.name}</span>
          <Badge
            variant="tertiary"
            className="ml-1 shrink-0 text-[0.7rem] tabular-nums"
          >
            <span className="font-bold">{rolePermissionCount(role)}</span>{" "}
            {rolePermissionNoun(role)}
          </Badge>
        </div>
        {showEmptyStateComment ? (
          <p className="text-muted-foreground max-w-72 p-4 text-xs">
            {emptyStateComment}
          </p>
        ) : (
          <div ref={scrollUnlockRef} className="overflow-y-auto">
            <RolePermissionList role={role} />
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * RolePermissionTooltipGroup scopes the shared open state so at most one child
 * tooltip is open and it closes once the pointer leaves both its icon and the
 * tooltip (not just when another row is entered).
 */
export const RolePermissionTooltipGroup = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [activeRole, setActiveRole] = useState<SystemRole | null>(null);

  useEffect(() => {
    if (!activeRole) return;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const onPointerMove = (e: PointerEvent) => {
      const anchor =
        e.target instanceof Element
          ? e.target.closest("[data-role-permission-anchor]")
          : null;
      clearTimeout(closeTimer);
      if (anchor?.getAttribute("data-role-permission-anchor") === activeRole)
        return;
      closeTimer = setTimeout(
        () => setActiveRole((prev) => (prev === activeRole ? null : prev)),
        180,
      );
    };
    document.addEventListener("pointermove", onPointerMove);
    return () => {
      clearTimeout(closeTimer);
      document.removeEventListener("pointermove", onPointerMove);
    };
  }, [activeRole]);

  return (
    <ActiveRoleContext.Provider value={setActiveRole}>
      <ActiveRoleValueContext.Provider value={activeRole}>
        {children}
      </ActiveRoleValueContext.Provider>
    </ActiveRoleContext.Provider>
  );
};

/**
 * useDialogScrollUnlock returns a ref that lets its node scroll natively even
 * when inside a Radix Dialog: the dialog's react-remove-scroll blocks wheel via
 * a bubble listener on document, so a capture-phase listener stops the event
 * there before it is reached (native scroll still runs; nothing is prevented).
 */
function useDialogScrollUnlock() {
  return useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const stop = (e: Event) => e.stopPropagation();
    const options = { capture: true, passive: true };
    node.addEventListener("wheel", stop, options);
    node.addEventListener("touchmove", stop, options);
    return () => {
      node.removeEventListener("wheel", stop, { capture: true });
      node.removeEventListener("touchmove", stop, { capture: true });
    };
  }, []);
}
