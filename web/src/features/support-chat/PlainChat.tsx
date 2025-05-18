import { env } from "@/src/env.mjs";
import { type Plan } from "@langfuse/shared";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Plain: any;
  }
}

const PlainChat = () => {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return;
    if (!env.NEXT_PUBLIC_PLAIN_APP_ID) {
      console.error("NEXT_PUBLIC_PLAIN_APP_ID is not set");
      return;
    }

    // Check if URL contains supportChat parameter
    const shouldShowChat =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("supportChat") === "1";

    // Load the script only once
    if (!scriptRef.current) {
      const script = document.createElement("script");
      script.async = false;
      script.src = "https://chat.cdn-plain.com/index.js";
      script.onload = () => {
        window.Plain.init({
          appId: env.NEXT_PUBLIC_PLAIN_APP_ID,
          hideLauncher: !shouldShowChat,
          hideBranding: true,
          hideThreadRefs: true,
          logo: {
            url: "/icon256.png",
            alt: "Langfuse logo",
          },
          style: {
            brandColor: "#000000", // This will be used in various places in the chat widget such as the primary chat button and send message button
            brandBackgroundColor: "#0A60B5", // Used for the background of the chat widget on the intro screen
            launcherBackgroundColor: "#666666", // These can also be passed in this format { light: '#FFFFFF', dark: '#000000' }
            launcherIconColor: "#FFFFFF",
          },
          links: [
            {
              icon: "book",
              text: "View Langfuse docs",
              url: "https://langfuse.com/docs",
            },
          ],
        });

        // If URL parameter is present, open the chat immediately
        if (shouldShowChat) {
          window.Plain.open();
        }
      };

      document.head.appendChild(script);
      scriptRef.current = script;

      // Cleanup function to remove the script when the component unmounts
      return () => {
        if (scriptRef.current && document.head.contains(scriptRef.current)) {
          document.head.removeChild(scriptRef.current);
        }
      };
    }
  }, []);

  return null;
};

export default PlainChat;

export const chatAvailable = !!env.NEXT_PUBLIC_PLAIN_APP_ID;

export const chatLoaded = () => {
  return (
    chatAvailable && typeof window !== "undefined" && window.Plain !== undefined
  );
};

export const showChat = (): void => {
  if (chatLoaded()) {
    window.Plain.update({
      hideLauncher: false,
    });
  }
};

export const hideChat = (): void => {
  if (chatLoaded()) {
    window.Plain.update({
      hideLauncher: true,
    });
  }
};

export const closeChat = (): void => {
  if (chatLoaded()) {
    window.Plain.close();
  }
};

export const openChat = (): void => {
  if (chatLoaded()) {
    showChat();
    window.Plain.open();
  }
};

export const getUnreadMessageCount = (): number | null => {
  if (chatLoaded()) {
    return window.Plain.getUnreadMessageCount();
  }
  return null;
};

export const chatSetCustomer = (customer: {
  email?: string;
  fullName?: string;
  emailHash?: string;
  chatAvatarUrl?: string;
}) => {
  if (chatLoaded()) {
    window.Plain.update({
      customerDetails: customer,
    });
  }
};

export const chatSetThreadDetails = (p: { orgId?: string; plan?: Plan }) => {
  if (chatLoaded()) {
    window.Plain.update({
      threadDetails: {
        ...(p.orgId && {
          tenantIdentifier: {
            externalId: `cloud_${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}_org_${p.orgId}`,
          },
        }),
        ...(p.plan && {
          tierIdentifier: {
            externalId: p.plan,
          },
        }),
        // project_id: `cloud_${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}_project_${project?.id}`,
      },
    });
  }
};
