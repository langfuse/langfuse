"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const CrispChat = () => {
  const capture = usePostHogClientCapture();

  useEffect(() => {
    if (env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);

      // Check session storage for chat visibility
      // Expires at end of session
      const shouldShowChat =
        sessionStorage.getItem("supportChatVisible") === "true";
      if (!shouldShowChat) {
        Crisp.chat.hide();
      }
      Crisp.chat.onChatInitiated(() => {
        capture("support_chat:initiated");
      });
      Crisp.chat.onChatOpened(() => {
        capture("support_chat:opened");
      });
      Crisp.message.onMessageSent(() => {
        capture("support_chat:message_sent");
      });
      Crisp.message.onMessageReceived(() => {
        showChat();
      });
      try {
        if (Crisp.chat.unreadCount() > 0) {
          showChat();
        }
      } catch (e) {
        // do nothing, this throws unnecessary errors that cannot be fixed
      }
      return () => {
        Crisp.chat.offChatInitiated();
        Crisp.chat.offChatOpened();
        Crisp.message.offMessageSent();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default CrispChat;

export const chatSetUser = ({
  name,
  email,
  avatar,
  data,
  segments,
}: {
  name?: string;
  email?: string;
  avatar?: string;
  data?: object;
  segments?: string[];
}) => {
  if (chatAvailable) {
    if (email) Crisp.user.setEmail(email);
    if (name) Crisp.user.setNickname(name);
    if (avatar) Crisp.user.setAvatar(avatar);
    if (data) Crisp.session.setData(data);
    if (segments) Crisp.session.setSegments(segments, true);
  }
};

type Trigger = "after-project-creation";

export const chatRunTrigger = (trigger: Trigger) => {
  if (chatAvailable) {
    try {
      Crisp.trigger.run(trigger);
    } catch (e) {
      console.error("Failed to run Crisp trigger", e);
    }
  }
};

export const sendUserChatMessage = (message: string) => {
  openChat();
  if (chatAvailable) Crisp.message.send("text", message);
};

export const showAgentChatMessage = (message: string) => {
  openChat();
  if (chatAvailable) Crisp.message.show("text", message);
};

export const openChat = () => {
  showChat();
  if (chatAvailable) Crisp.chat.open();
};

export const hideChat = () => {
  if (chatAvailable) {
    sessionStorage.setItem("supportChatVisible", "false");
    Crisp.chat.hide();
  }
};

export const showChat = () => {
  if (chatAvailable) {
    sessionStorage.setItem("supportChatVisible", "true");
    Crisp.chat.show();
  }
};

export const chatIsVisible = () => {
  if (!chatAvailable) return false;
  return sessionStorage.getItem("supportChatVisible") === "true";
};

export const chatAvailable = !!process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
