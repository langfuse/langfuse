import { mergeConfig } from "vitest/config";
import sharedConfig from "./vitest.shared.mjs";
import serverConfig from "./vitest.server.config.mjs";
import clientConfig from "./vitest.client.config.mjs";
import storybookConfig from "./vitest.storybook.config.mjs";

export default mergeConfig(sharedConfig, {
  test: {
    projects: [
      ...(serverConfig.test?.projects ?? []),
      ...(clientConfig.test?.projects ?? []),
      ...(storybookConfig.test?.projects ?? []),
    ],
  },
});
