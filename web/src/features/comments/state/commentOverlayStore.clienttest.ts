import {
  createCommentOverlayStore,
  type CommentTarget,
} from "./commentOverlayStore";

const target: CommentTarget = {
  type: "comments",
  objectId: "first",
  objectType: "TRACE",
};
const selection = {
  dataField: "output" as const,
  path: ["$"],
  rangeStart: [0],
  rangeEnd: [4],
  selectedText: "text",
  anchorRect: null,
};
const input = {
  target,
  canWrite: true,
  loadComments: async () => [{ id: "comment" }],
  confirmDiscard: () => true,
};
function deferred() {
  let resolve!: (comments: { id: string }[]) => void;
  const promise = new Promise<{ id: string }[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("comment overlay asynchronous actions", () => {
  it("does not reopen a dismissed inline thread when a late comment finishes", async () => {
    const store = createCommentOverlayStore();
    await store.getState().actions.open({
      ...input,
      target: { ...target, type: "inline-comment", selection },
    });
    const opened = store.getState().overlay!;
    store.getState().actions.close(opened, () => true);
    store.getState().actions.consumeSelection(opened);
    expect(store.getState().overlay?.isOpen).toBe(false);
  });

  it("keeps a draft edited while another target is loading", async () => {
    const store = createCommentOverlayStore();
    await store.getState().actions.open(input);
    const opened = store.getState().overlay!;
    const request = deferred();
    const opening = store.getState().actions.open({
      ...input,
      target: { ...target, objectId: "second" },
      loadComments: () => request.promise,
    });
    store.getState().actions.setDraft(opened.id, true);
    request.resolve([]);
    await opening;
    expect(store.getState().overlay?.target.objectId).toBe("first");
    expect(store.getState().hasDraft).toBe(true);
    expect(store.getState().actions.close(opened)).toBe(true);
    expect(store.getState().overlay?.isOpen).toBe(false);
  });

  it("keeps the latest inline selection on the same target", async () => {
    const store = createCommentOverlayStore();
    const request = deferred();
    const first = store.getState().actions.open({
      ...input,
      target: { ...target, type: "inline-comment", selection },
      loadComments: () => request.promise,
    });
    const latestSelection = { ...selection, rangeStart: [5], rangeEnd: [9] };
    const second = store.getState().actions.open({
      ...input,
      target: {
        ...target,
        type: "inline-comment",
        selection: latestSelection,
      },
      loadComments: () => request.promise,
    });
    request.resolve([]);
    await Promise.all([first, second]);
    expect(store.getState().overlay?.target).toMatchObject({
      selection: latestSelection,
    });
  });

  it("does not let completion in an older composer cancel a newer open request", async () => {
    const store = createCommentOverlayStore();
    await store
      .getState()
      .actions.open({ ...input, loadComments: async () => [] });
    const opened = store.getState().overlay!;
    const request = deferred();
    const opening = store.getState().actions.open({
      ...input,
      target: { ...target, objectId: "second" },
      loadComments: () => request.promise,
    });
    store.getState().actions.close(opened);
    request.resolve([{ id: "second-comment" }]);
    await opening;
    expect(store.getState().overlay).toMatchObject({
      isOpen: true,
      target: { objectId: "second" },
    });
  });
});
