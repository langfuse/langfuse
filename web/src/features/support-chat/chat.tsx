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
  if (chatAvailable) Crisp.trigger.run(trigger);
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
