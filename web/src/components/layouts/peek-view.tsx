import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { X } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

export default function PeekView(props: {
  item: {
    name: string;
    type: string;
    link: string;
  };
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  actionButtons?: ReactNode;
}) {
  return (
    <Drawer open={props.open} modal={false} onClose={props.onClose}>
      <DrawerContent size="lg" className="mx-auto" data-vaul-no-drag>
        <DrawerHeader className="sticky top-0 z-10 mb-2 flex flex-row items-center justify-between rounded-tl-xl border-b bg-background p-3">
          <DrawerTitle className="flex flex-row items-center gap-2">
            <div className="mb-2 mt-2 flex flex-wrap items-center justify-between gap-2">
              {props.actionButtons ?? null}
              <h3 className="text-xl font-bold leading-7 sm:tracking-tight">
                {`${props.item.type}:`}
              </h3>
              <Link
                className="inline-block h-5 max-w-full overflow-hidden text-ellipsis text-nowrap rounded bg-primary-accent/20 px-2 py-0.5 text-base font-semibold text-accent-dark-blue shadow-sm hover:bg-accent-light-blue/45"
                href={props.item.link}
                title={props.item.name}
              >
                {props.item.name}
              </Link>
            </div>
          </DrawerTitle>
          <DrawerClose asChild onClick={props.onClose}>
            <Button variant="outline" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div
          data-vaul-no-drag
          className="mb-4 h-full flex-1 select-text gap-4 overflow-hidden px-4"
        >
          {props.children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
