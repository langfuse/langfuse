import { createContext, useContext, type ReactNode } from "react";

type SpielwieseOnboardingModelPickerState = {
  apiKeyValue: string;
  onApiKeyChange: (value: string) => void;
  onApiKeyContinue: () => void;
  onModelChange: (value: string) => void;
  showAnthropicApiKeyPrompt: boolean;
};

const SpielwieseOnboardingModelPickerContext =
  createContext<SpielwieseOnboardingModelPickerState | null>(null);

export function SpielwieseOnboardingModelPickerProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SpielwieseOnboardingModelPickerState;
}) {
  return (
    <SpielwieseOnboardingModelPickerContext.Provider value={value}>
      {children}
    </SpielwieseOnboardingModelPickerContext.Provider>
  );
}

export function useSpielwieseOnboardingModelPicker() {
  return useContext(SpielwieseOnboardingModelPickerContext);
}
