import type { ComponentType } from "react";

type SpielwieseSignUpShaderModule = {
  default: ComponentType<{ paused?: boolean }>;
};

let signUpShaderPreloadPromise: Promise<SpielwieseSignUpShaderModule> | null =
  null;

export function importSpielwieseSignUpShader() {
  signUpShaderPreloadPromise ??= import("./SpielwieseSignUpShader");

  return signUpShaderPreloadPromise;
}

export function preloadSpielwieseSignUpShader() {
  if (typeof window === "undefined" || process.env.NODE_ENV === "test") {
    return;
  }

  void importSpielwieseSignUpShader();
}
