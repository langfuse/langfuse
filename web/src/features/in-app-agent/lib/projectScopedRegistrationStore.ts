type Registration<T> = {
  owner: symbol;
  value: T;
};

export function createProjectScopedRegistrationStore<T>() {
  const registrations = new Map<string, Map<string, Registration<T>>>();
  const listeners = new Map<string, Set<() => void>>();
  const valueSnapshots = new Map<string, readonly T[]>();

  const emitChange = (projectId: string) => {
    valueSnapshots.delete(projectId);
    listeners.get(projectId)?.forEach((listener) => {
      listener();
    });
  };

  return {
    register(projectId: string, key: string, value: T) {
      const owner = Symbol(key);
      const projectRegistrations =
        registrations.get(projectId) ?? new Map<string, Registration<T>>();

      projectRegistrations.set(key, { owner, value });
      registrations.set(projectId, projectRegistrations);
      emitChange(projectId);

      return () => {
        if (projectRegistrations.get(key)?.owner !== owner) {
          return false;
        }

        projectRegistrations.delete(key);
        if (projectRegistrations.size === 0) {
          registrations.delete(projectId);
        }
        emitChange(projectId);
        return true;
      };
    },

    get(projectId: string, key: string) {
      return registrations.get(projectId)?.get(key)?.value;
    },

    has(projectId: string, key: string) {
      return registrations.get(projectId)?.has(key) ?? false;
    },

    values(projectId: string): readonly T[] {
      const cachedSnapshot = valueSnapshots.get(projectId);
      if (cachedSnapshot) {
        return cachedSnapshot;
      }

      const snapshot = Object.freeze(
        Array.from(
          registrations.get(projectId)?.values() ?? [],
          ({ value }) => value,
        ),
      );
      valueSnapshots.set(projectId, snapshot);
      return snapshot;
    },

    subscribe(projectId: string, listener: () => void) {
      const projectListeners =
        listeners.get(projectId) ?? new Set<() => void>();
      projectListeners.add(listener);
      listeners.set(projectId, projectListeners);

      return () => {
        projectListeners.delete(listener);
        if (projectListeners.size === 0) {
          listeners.delete(projectId);
        }
      };
    },
  };
}
