"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";

const CrispChat = () => {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID)
      Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
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
  if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
    Crisp.user.setEmail(email);
    Crisp.user.setNickname(name);
    Crisp.session.setData(data);
  }
};

type Trigger = "after-project-creation";

export const chatRunTrigger = (trigger: Trigger) => {
  if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
    Crisp.trigger.run(trigger);
  }
};

export const openChat = () => {
  if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
    Crisp.chat.open();
  }
};
