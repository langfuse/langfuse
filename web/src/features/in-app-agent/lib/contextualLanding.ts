import { useSyncExternalStore } from "react";

export type InAppAgentContextualLandingExample = {
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

type RegisteredLanding = {
  owner: symbol;
  landing: InAppAgentContextualLanding;
};

const registeredLandings = new Map<string, Map<string, RegisteredLanding>>();
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
  const owner = Symbol(landing.id);
  const projectLandings =
    registeredLandings.get(projectId) ?? new Map<string, RegisteredLanding>();

  projectLandings.set(landing.id, { owner, landing });
  registeredLandings.set(projectId, projectLandings);

  if (activeLandingIds.get(projectId) === landing.id) {
    emitChange(projectId);
  }

  return () => {
    const currentLanding = registeredLandings.get(projectId)?.get(landing.id);
    if (currentLanding?.owner !== owner) {
      return;
    }

    projectLandings.delete(landing.id);
    if (projectLandings.size === 0) {
      registeredLandings.delete(projectId);
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
  if (!registeredLandings.get(projectId)?.has(landingId)) {
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

  return registeredLandings.get(projectId)?.get(activeLandingId)?.landing;
}

export function subscribeToInAppAgentContextualLanding(
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
