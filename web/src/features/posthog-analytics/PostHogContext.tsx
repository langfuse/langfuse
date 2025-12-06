import React, { createContext, useContext, type ReactNode } from "react";
import { type PostHog } from "posthog-js";

/**
 * Context to provide PostHog instance without statically importing posthog-js/react
 * This allows the PostHog dependency to remain lazy-loaded and not included in the main bundle
 */
const PostHogContext = createContext<any | null>(null);

export interface PostHogContextProviderProps {
  children: ReactNode;
  posthogInstance: PostHog;
}

export const PostHogContextProvider: React.FC<PostHogContextProviderProps> = ({
  children,
  posthogInstance,
}) => {
  return (
    <PostHogContext.Provider value={posthogInstance}>
      {children}
    </PostHogContext.Provider>
  );
};

export const usePostHogContext = () => {
  return useContext(PostHogContext);
};
