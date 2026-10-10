import { beforeEach } from "vitest";
import { commands } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    resetStorybookPointer: () => Promise<void>;
  }
}

/** The pointer reset prevents native hover from overriding simulated interactions. */
beforeEach(async () => {
  await commands.resetStorybookPointer();
});
