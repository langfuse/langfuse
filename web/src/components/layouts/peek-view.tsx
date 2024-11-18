import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { X } from "lucide-react";
import { type ReactNode } from "react";

export default function PeekView(props: {
  key: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  actionButtons?: ReactNode;
}) {
  return (
    <Drawer open={props.open} modal={false} onClose={props.onClose}>
      <DrawerContent size="lg" className="mx-auto">
        <DrawerHeader className="sticky top-0 z-10 flex flex-row items-center justify-between rounded-sm bg-background">
          <DrawerTitle className="flex flex-row items-center gap-2">
            {props.actionButtons ?? null}
            <Header title={props.title} level="h3"></Header>
          </DrawerTitle>
          <DrawerClose asChild onClick={props.onClose}>
            <Button variant="outline" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div
          data-vaul-no-drag
          className="mb-4 h-full flex-1 gap-4 overflow-hidden px-4"
        >
          {props.children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
