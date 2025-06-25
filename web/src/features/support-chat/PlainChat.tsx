import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { type Plan } from "@langfuse/shared";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Plain: any;
  }
}

// Add these at the top level
let metadataQueue: Array<() => void> = [];
let isWidgetLoaded = false;

const PlainChat = () => {
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const updatePlainDataMut = api.plain.updatePlainData.useMutation({
    onError: () => {}, // Don't show default error toast
  });
  const session = useSession();
  const [isWidgetLoadedState, setIsWidgetLoadedState] = useState(false);

  const updateIsWidgetLoaded = (value: boolean) => {
    setIsWidgetLoadedState(value); // for use in useEffect
    isWidgetLoaded = value; // for use in global functions
  };

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
          chatButtons: [
            {
              icon: "email",
              text: "Contact Support",
            },
          ],
          links: [
            {
              icon: "chat",
              text: "Ask AI Chat",
              url: "https://langfuse.com/ask-ai",
            },
            {
              icon: "book",
              text: "View Langfuse docs",
              url: "https://langfuse.com/docs",
            },
          ],
        });

        // Mark widget as loaded and process queued metadata updates
        updateIsWidgetLoaded(true);
        for (const metadataUpdate of metadataQueue) {
          try {
            metadataUpdate();
          } catch (error) {
            console.error("Error updating Plain metadata", error);
          }
        }
        metadataQueue = [];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Plain.com data when user is authenticated and chat is loaded
  // Trigger not be authenticated to prevent trigger on every auth session refresh (status=loading)
  const isNotUnauthenticated = session.status !== "unauthenticated";

  useEffect(() => {
    if (
      isNotUnauthenticated &&
      isWidgetLoaded &&
      session.status === "authenticated" &&
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ) {
      updatePlainDataMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotUnauthenticated, isWidgetLoadedState]);

  return null;
};

export default PlainChat;

export const chatAvailable = !!env.NEXT_PUBLIC_PLAIN_APP_ID;

export const chatLoaded = () => {
  return (
    chatAvailable && typeof window !== "undefined" && window.Plain !== undefined
  );
};

const runOrQueuePlainCallback = (cb: () => void) => {
  if (isWidgetLoaded) {
    cb();
  } else {
    metadataQueue.push(cb);
  }
};

export const showChat = (): void => {
  runOrQueuePlainCallback(() => {
    if (chatLoaded()) {
      window.Plain.update({
        hideLauncher: false,
      });
    }
  });
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
  runOrQueuePlainCallback(() => {
    if (chatLoaded()) {
      showChat();
      window.Plain.open();
    }
  });
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
  runOrQueuePlainCallback(() => {
    if (chatLoaded()) {
      window.Plain.update({
        customerDetails: customer,
      });
    }
  });
};

export const chatSetThreadDetails = (p: { orgId?: string; plan?: Plan }) => {
  runOrQueuePlainCallback(() => {
    if (chatLoaded()) {
      window.Plain.update({
        threadDetails: {
          ...(p.orgId && {
            tenantIdentifier: {
              externalId: `cloud_${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}_org_${p.orgId}`,
            },
          }),
        },
      });
    }
  });
};
