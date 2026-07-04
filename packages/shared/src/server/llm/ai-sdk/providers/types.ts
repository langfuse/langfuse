import type { LanguageModel } from "ai";

import type { AiSdkProviderMetadata, AiSdkProviderOptions } from "../types";

export type AiSdkModelResolution = {
  model: LanguageModel;
  providerOptions?: AiSdkProviderOptions;
  callSettings: {
    seed?: number;
  };
  metadata: AiSdkProviderMetadata;
};
