"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { ChatMessageType, type ChatMessageWithId } from "@langfuse/shared";
import { useTranslations } from "next-intl";

import {
  createMessageSearchController,
  type MessageSearchController,
  type MessageSearchMessageLabelResolver,
  type MessageSearchPageLabelResolver,
} from "./controller";

const MessageSearchContext = createContext<MessageSearchController | null>(
  null,
);
const MessageSearchPageContext = createContext<string | null>(null);

export function MessageSearchProvider({
  children,
  pageIds,
  captureRootRef,
  getPageLabel,
}: {
  children: ReactNode;
  pageIds: string[];
  captureRootRef?: RefObject<HTMLElement | null>;
  getPageLabel?: MessageSearchPageLabelResolver;
}) {
  const t = useTranslations("sharedUi.chatMessages");
  const getMessageLabel = useCallback<MessageSearchMessageLabelResolver>(
    (message, index) => {
      if (message.type === ChatMessageType.Placeholder) {
        return t("search.placeholder", { index: index + 1 });
      }

      if ("role" in message) {
        const roleLabel =
          message.role === "system"
            ? t("roles.system")
            : message.role === "developer"
              ? t("roles.developer")
              : message.role === "assistant"
                ? t("roles.assistant")
                : message.role === "user"
                  ? t("roles.user")
                  : message.role === "tool"
                    ? t("roles.tool")
                    : String(message.role);

        return t("search.roleMessage", { role: roleLabel, index: index + 1 });
      }

      return t("search.message", { index: index + 1 });
    },
    [t],
  );
  const [controller] = useState(() =>
    createMessageSearchController(pageIds, getPageLabel, getMessageLabel),
  );

  useEffect(() => {
    controller.setPageIds(pageIds);
  }, [controller, pageIds]);

  useEffect(() => {
    controller.setPageLabelResolver(getPageLabel);
  }, [controller, getPageLabel]);

  useEffect(() => {
    controller.setMessageLabelResolver(getMessageLabel);
  }, [controller, getMessageLabel]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const captureRoot = captureRootRef?.current;
      if (captureRoot) {
        const eventTarget = event.target;
        const activeElement = document.activeElement;
        const targetIsInsideRoot =
          eventTarget instanceof Node && captureRoot.contains(eventTarget);
        const activeElementIsInsideRoot =
          activeElement instanceof Node && captureRoot.contains(activeElement);

        if (!targetIsInsideRoot && !activeElementIsInsideRoot) {
          return;
        }
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLocaleLowerCase() === "f"
      ) {
        event.preventDefault();
        controller.openSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [captureRootRef, controller]);

  return (
    <MessageSearchContext.Provider value={controller}>
      {children}
    </MessageSearchContext.Provider>
  );
}

function useMessageSearchController() {
  const controller = useContext(MessageSearchContext);
  if (!controller) {
    throw new Error(
      "useMessageSearch must be used within MessageSearchProvider",
    );
  }

  return controller;
}

export function useMessageSearchActions() {
  return useMessageSearchController();
}

export function useOptionalMessageSearchActions() {
  return useContext(MessageSearchContext);
}

export function MessageSearchPageProvider({
  children,
  pageId,
}: {
  children: ReactNode;
  pageId: string;
}) {
  return (
    <MessageSearchPageContext.Provider value={pageId}>
      {children}
    </MessageSearchPageContext.Provider>
  );
}

export function useOptionalMessageSearchPageId() {
  return useContext(MessageSearchPageContext);
}

export function useMessageSearch() {
  const controller = useMessageSearchController();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return {
    ...snapshot,
    openSearch: controller.openSearch,
    closeSearch: controller.closeSearch,
    setQueryInput: controller.setQueryInput,
    blurQueryInput: controller.blurQueryInput,
    nextMatch: controller.nextMatch,
    previousMatch: controller.previousMatch,
  };
}

export function useSyncMessageSearchMessages(
  pageId: string,
  messages: ChatMessageWithId[],
) {
  const actions = useOptionalMessageSearchActions();

  useEffect(() => {
    if (!actions) {
      return;
    }

    actions.registerPageMessages(pageId, messages);
  }, [actions, messages, pageId]);

  useEffect(() => {
    if (!actions) {
      return;
    }

    return () => {
      actions.unregisterPageMessages(pageId);
    };
  }, [actions, pageId]);
}
