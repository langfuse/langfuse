"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";
import { env } from "@/src/env.mjs";

const CrispChat = () => {
  useEffect(() => {
    if (env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
      const chatVisible = sessionStorage.getItem("lf_support_chat_visible");
      if (chatVisible === null) {
        sessionStorage.setItem("lf_support_chat_visible", "false");
        hideChat();
      } else if (chatVisible === "true") {
        openChat();
      } else {
        hideChat();
      }
    }
  }, []);

  return null;
};

export default CrispChat;

export const chatSetUser = ({
  name,
  email,
  data,
}: {
  name: string;
  email: string;
  data: object;
}) => {
  if (chatAvailable) {
    Crisp.user.setEmail(email);
    Crisp.user.setNickname(name);
    Crisp.session.setData(data);
  }
};

type Trigger = "after-project-creation";

export const chatRunTrigger = (trigger: Trigger) => {
  if (!chatAvailable) return;
  showChat();
  Crisp.trigger.run(trigger);
};

export const sendUserChatMessage = (message: string) => {
  if (!chatAvailable) return;
  openChat();
  Crisp.message.send("text", message);
};

export const showAgentChatMessage = (message: string) => {
  if (!chatAvailable) return;
  openChat();
  Crisp.message.show("text", message);
};

export const showChat = () => {
  if (!chatAvailable) return;
  Crisp.chat.show();
  sessionStorage.setItem("lf_support_chat_visible", "true");
};

export const openChat = () => {
  if (!chatAvailable) return;
  showChat();
  Crisp.chat.open();
};

export const hideChat = () => {
  if (!chatAvailable) return;
  Crisp.chat.hide();
  sessionStorage.setItem("lf_support_chat_visible", "false");
};

export const chatAvailable = !!env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
