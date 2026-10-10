import { useSyncExternalStore } from "react";
import { createProjectScopedRegistrationStore } from "./projectScopedRegistrationStore";

type InAppAgentContextualLandingExample = {
  id: string;
  label: string;
  prompt: string;
};

export type InAppAgentContextualLanding = {
  id: string;
  title: string;
  description: string;
  examples: readonly InAppAgentContextualLandingExample[];
  placeholder?: string;
  onSubmit: (input: string) => Promise<boolean>;
};

const registeredLandings =
  createProjectScopedRegistrationStore<InAppAgentContextualLanding>();
const activeLandingIds = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function emitChange(projectId: string) {
  listeners.get(projectId)?.forEach((listener) => {
    listener();
  });
}

export function registerInAppAgentContextualLanding(
  projectId: string,
  landing: InAppAgentContextualLanding,
) {
  const unregister = registeredLandings.register(
    projectId,
    landing.id,
    landing,
  );
  if (activeLandingIds.get(projectId) === landing.id) {
    emitChange(projectId);
  }

  return () => {
    if (!unregister()) {
      return;
    }

    if (activeLandingIds.get(projectId) === landing.id) {
      activeLandingIds.delete(projectId);
      emitChange(projectId);
    }
  };
}

export function activateInAppAgentContextualLanding(
  projectId: string,
  landingId: string,
) {
  if (!registeredLandings.has(projectId, landingId)) {
    return false;
  }

  if (activeLandingIds.get(projectId) !== landingId) {
    activeLandingIds.set(projectId, landingId);
    emitChange(projectId);
  }
  return true;
}

export function clearInAppAgentContextualLanding(projectId: string) {
  if (activeLandingIds.delete(projectId)) {
    emitChange(projectId);
  }
}

export function getInAppAgentContextualLanding(projectId: string) {
  const activeLandingId = activeLandingIds.get(projectId);
  if (!activeLandingId) {
    return undefined;
  }

  return registeredLandings.get(projectId, activeLandingId);
}

function subscribeToInAppAgentContextualLanding(
  projectId: string,
  listener: () => void,
) {
  const projectListeners = listeners.get(projectId) ?? new Set<() => void>();
  projectListeners.add(listener);
  listeners.set(projectId, projectListeners);

  return () => {
    projectListeners.delete(listener);
    if (projectListeners.size === 0) {
      listeners.delete(projectId);
    }
  };
}

export function useInAppAgentContextualLanding(projectId: string | undefined) {
  return useSyncExternalStore(
    (listener) =>
      projectId
        ? subscribeToInAppAgentContextualLanding(projectId, listener)
        : () => undefined,
    () => (projectId ? getInAppAgentContextualLanding(projectId) : undefined),
    () => undefined,
  );
}
