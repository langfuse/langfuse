import { beforeEach } from "vitest";
import { commands } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    resetStorybookPointer: () => Promise<void>;
  }
}

// Keep native hover events from overriding Storybook's simulated interactions.
beforeEach(async () => {
  await commands.resetStorybookPointer();
});
