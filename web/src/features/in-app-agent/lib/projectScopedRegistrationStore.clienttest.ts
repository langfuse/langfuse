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

  it("keeps a replacement when the stale owner cleans up", () => {
    const store = createProjectScopedRegistrationStore<string>();
    const unregisterOld = store.register("project-1", "feature", "old");
    const unregisterNew = store.register("project-1", "feature", "new");

    unregisterOld();
    expect(store.get("project-1", "feature")).toBe("new");

    unregisterNew();
  });
});
