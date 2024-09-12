"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";
import { env } from "@/src/env.mjs";

const CrispChat = () => {
  useEffect(() => {
    if (env.NEXT_PUBLIC_CRISP_WEBSITE_ID)
      Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
  });

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
  if (chatAvailable) Crisp.chat.open();
};

export const chatAvailable = !!process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
