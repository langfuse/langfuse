// The in-app-agent feature's public client surface (RFC rule 8). Named
// re-exports only — the provider, dialog controller, and widget composer
// other features already imported by file path.
//
// inAppAgentRouter and server helpers stay off this door. ids, display,
// and watchFrames stay deep for server tests (rule 10).
export { DialogController } from "@/src/features/in-app-agent/components/dialog-controller";
export { InAppAgentWidgetComposer } from "@/src/features/in-app-agent/components/InAppAgentWidgetComposer";
export {
  InAppAiAgentProvider,
  useInAppAiAgent,
  useIsInAppAgentLauncherVisible,
  type InAppAgentEntryPoint,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
