import { CopyIcon } from "lucide-react";
import { expect, fn, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta = preview.meta({
  component: DropdownMenu,
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Options" size="icon-xs" variant="ghost">
          Options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem className="text-xs" onSelect={fn()}>
          <span>
            filter by <span className="font-bold">name:SupportChatSession</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onSelect={fn()}>
          <span>
            filter by <span className="font-bold">type:SPAN</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" onSelect={fn()}>
          <CopyIcon className="mr-2 h-4 w-4" />
          Copy Trace ID
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onSelect={fn()}>
          <CopyIcon className="mr-2 h-4 w-4" />
          Copy Observation ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
});

export default meta;

export const Default = meta.story({});

export const TestMenuItemsUsePointerCursor = meta.story({
  name: "(Test) Menu items use pointer cursor",
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const items = await body.findAllByRole("menuitem");

    await expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      await expect(getComputedStyle(item).cursor).toBe("pointer");
    }
  },
});
