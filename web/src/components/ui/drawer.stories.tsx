import preview from "../../../.storybook/preview";
import { Button } from "./button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "./drawer";

const meta = preview.meta({
  component: Drawer,
});

/**
 * Short bottom-sheet content should hug its children. A forced `h-1/3` or
 * full-viewport height leaves a hollow band under the last action on phones.
 */
export const Compact = meta.story({
  render: () => (
    <Drawer open forceDirection="bottom" shouldScaleBackground={false}>
      <DrawerContent size="full">
        <DrawerHeader className="p-4 text-left">
          <div className="flex w-full items-center justify-center">
            <div className="bg-muted h-2 w-20 rounded-full" />
          </div>
          <DrawerTitle>Support</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-muted-foreground text-sm">
            Get instant, helpful answers from docs and examples.
          </p>
          <Button variant="outline">Chat with AI</Button>
          <Button variant="outline">View documentation</Button>
          <Button variant="outline">Email a Support Engineer</Button>
        </div>
      </DrawerContent>
    </Drawer>
  ),
});
