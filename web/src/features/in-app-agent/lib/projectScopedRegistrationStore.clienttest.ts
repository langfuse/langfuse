import { createProjectScopedRegistrationStore } from "./projectScopedRegistrationStore";

describe("project-scoped registration store", () => {
  it("isolates projects and exposes keyed registrations", () => {
    const store = createProjectScopedRegistrationStore<string>();
    const unregister = store.register("project-1", "feature", "one");

    expect(store.get("project-1", "feature")).toBe("one");
    expect(store.has("project-1", "feature")).toBe(true);
    expect(store.get("project-2", "feature")).toBeUndefined();
    expect(store.has("project-2", "feature")).toBe(false);

    unregister();
  });

  it("replaces values without changing their insertion order", () => {
    const store = createProjectScopedRegistrationStore<string>();
    const unregisterOld = store.register("project-1", "first", "old");
    const unregisterSecond = store.register("project-1", "second", "second");
    const unregisterNew = store.register("project-1", "first", "new");

    expect(store.values("project-1")).toEqual(["new", "second"]);
    expect(store.values("project-1")).toBe(store.values("project-1"));

    unregisterOld();
    expect(store.values("project-1")).toEqual(["new", "second"]);

    unregisterNew();
    unregisterSecond();
  });

  it("notifies project subscribers until they unsubscribe", () => {
    const store = createProjectScopedRegistrationStore<string>();
    const projectOneListener = vi.fn();
    const projectTwoListener = vi.fn();
    const unsubscribe = store.subscribe("project-1", projectOneListener);
    store.subscribe("project-2", projectTwoListener);

    const unregister = store.register("project-1", "feature", "one");
    const staleUnregister = unregister;
    const unregisterReplacement = store.register("project-1", "feature", "two");
    staleUnregister();
    unregisterReplacement();

    expect(projectOneListener).toHaveBeenCalledTimes(3);
    expect(projectTwoListener).not.toHaveBeenCalled();

    unsubscribe();
    store.register("project-1", "feature", "three");
    expect(projectOneListener).toHaveBeenCalledTimes(3);
  });
});
