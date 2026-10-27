import type { CapturedPageContext } from "@/src/features/page-context";
import type { InAppAgentWindowMessage } from "@/src/features/in-app-agent/components/InAppAgentWindow";

/** The page the user handed over: structured context plus a picture of it. */
export type StageContextAttachment = {
  context: CapturedPageContext;
  /** Downscaled capture for the bubble; null when capturing failed. */
  thumbnail: HTMLCanvasElement | null;
  /** Width / height of the viewport the page was captured in. */
  aspectRatio: number;
};

export type StageChatMessage = InAppAgentWindowMessage & {
  attachment?: StageContextAttachment;
};

export type StageChatConversation = { id: string; title: string | null };

export type StageChatBackend = "assistant" | "mock";

/**
 * What the stage chat UI needs from a backend. The live assistant and the
 * preview's mocked responder both implement it, so the UI does not know which
 * one it talks to.
 */
export type StageChatController = {
  backend: StageChatBackend;
  messages: StageChatMessage[];
  isResponding: boolean;
  /** Why sending is unavailable right now, if it is. */
  blockedReason: string | null;
  conversations: StageChatConversation[];
  activeConversationId: string | null;
  send: (text: string, attachment: StageContextAttachment) => void;
  stop: (() => void) | null;
  newConversation: () => void;
  selectConversation: (conversationId: string) => void;
};
