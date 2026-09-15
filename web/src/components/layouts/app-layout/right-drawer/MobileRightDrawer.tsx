import { type PropsWithChildren } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { SupportDrawer } from "@/src/features/support-chat/SupportDrawer";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { V4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanel";
import { useV4MigrationTitle } from "@/src/features/v4-migration/V4MigrationContent";

export function MobileRightDrawer({ children }: PropsWithChildren) {
  const { open: supportOpen, setOpen: setSupportOpen } = useSupportDrawer();
  const { open: migrationOpen, setOpen: setMigrationOpen } =
    useV4MigrationPanel();
  const migrationTitle = useV4MigrationTitle();

  return (
    <>
      <main className="h-full flex-1" style={{ overscrollBehaviorY: "none" }}>
        {children}
      </main>

      <Drawer
        open={supportOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSupportOpen(false);
          }
        }}
        forceDirection="bottom"
      >
        <DrawerContent id="support-drawer" size="full">
          <DrawerHeader className="p-0 text-left">
            <div className="flex w-full items-center justify-center pt-3">
              <div className="bg-muted h-2 w-20 rounded-full" />
            </div>
            {/* sr-only for screen readers and accessibility */}
            <DrawerTitle className="sr-only">Support</DrawerTitle>
            <DrawerDescription className="sr-only">
              A list of resources and options to help you with your questions.
            </DrawerDescription>
          </DrawerHeader>
          <SupportDrawer
            showCloseButton={false}
            className="min-h-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          />
        </DrawerContent>
      </Drawer>

      <Drawer
        open={migrationOpen}
        onOpenChange={(open) => {
          if (!open) {
            setMigrationOpen(false);
          }
        }}
        forceDirection="bottom"
      >
        <DrawerContent id="v4-migration-drawer" size="full">
          <DrawerHeader className="p-0 text-left">
            <div className="flex w-full items-center justify-center pt-3">
              <div className="bg-muted h-2 w-20 rounded-full" />
            </div>
            {/* sr-only for screen readers and accessibility */}
            <DrawerTitle className="sr-only">{migrationTitle}</DrawerTitle>
            <DrawerDescription className="sr-only">
              Action items to keep your integrations compatible with Langfuse v4
              and upcoming deprecations.
            </DrawerDescription>
          </DrawerHeader>
          <V4MigrationPanel
            showCloseButton={false}
            className="min-h-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          />
        </DrawerContent>
      </Drawer>
    </>
  );
}
