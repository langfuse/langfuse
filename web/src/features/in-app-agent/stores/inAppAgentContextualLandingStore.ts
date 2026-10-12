export type InAppAgentContextualLanding = {
  id: string;
  title: string;
  description: string;
  examples: readonly {
    id: string;
    label: string;
    prompt: string;
  }[];
  placeholder?: string;
  instructions: string;
};

type Registration = {
  owner: symbol;
  landing: InAppAgentContextualLanding;
};

const registrations = new Map<string, Registration>();
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
  registrations.set(projectId, { owner, landing });
  emitChange(projectId);

  return () => {
    if (registrations.get(projectId)?.owner !== owner) {
      return;
    }
    registrations.delete(projectId);
    emitChange(projectId);
  };
}

export function getInAppAgentContextualLanding(projectId: string) {
  return registrations.get(projectId)?.landing;
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
