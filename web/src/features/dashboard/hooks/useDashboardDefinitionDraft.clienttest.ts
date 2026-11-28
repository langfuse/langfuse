import { act, renderHook } from "@testing-library/react";

import { useDashboardDefinitionDraft } from "@/src/features/dashboard/hooks/useDashboardDefinitionDraft";

const definition = (placementId: string) => ({
  widgets: [
    {
      id: placementId,
      type: "widget" as const,
      widgetId: `widget-${placementId}`,
      x: 0,
      y: 0,
      x_size: 6,
      y_size: 6,
    },
  ],
});

describe("useDashboardDefinitionDraft", () => {
  it("rejects a pending insertion after edit access is lost", () => {
    const initial = definition("existing");
    const inserted = definition("new-widget");
    const { result, rerender } = renderHook(
      ({ canEdit }) => useDashboardDefinitionDraft(initial, canEdit),
      { initialProps: { canEdit: true } },
    );
    const pendingInsertion = result.current.applyDraft;
    rerender({ canEdit: false });

    let accepted: boolean | undefined;
    act(() => {
      accepted = pendingInsertion(inserted);
    });

    expect(result.current.definition).toBe(initial);
    expect(result.current.definitionRef.current).toBe(initial);
    expect(accepted).toBe(false);

    rerender({ canEdit: true });
    act(() => {
      accepted = pendingInsertion(inserted);
    });
    expect(accepted).toBe(true);
    expect(result.current.definition).toBe(inserted);
  });

  it("adopts refreshed dashboard definitions while no local edit is pending", () => {
    const initialDefinition = definition("initial");
    const refreshedDefinition = definition("agent-created");
    const { result, rerender } = renderHook(
      ({ serverDefinition }) =>
        useDashboardDefinitionDraft(serverDefinition, true),
      { initialProps: { serverDefinition: initialDefinition } },
    );

    expect(result.current.definition).toBe(initialDefinition);

    rerender({ serverDefinition: refreshedDefinition });

    expect(result.current.definition).toBe(refreshedDefinition);
  });

  it("preserves newer local edits until their exact save completes", () => {
    const initialDefinition = definition("initial");
    const firstDraft = definition("first-local-edit");
    const newerDraft = definition("newer-local-edit");
    const refreshedDefinition = definition("agent-created");
    const savedDefinition = definition("saved-newer-edit");
    const { result, rerender } = renderHook(
      ({ serverDefinition }) =>
        useDashboardDefinitionDraft(serverDefinition, true),
      { initialProps: { serverDefinition: initialDefinition } },
    );

    act(() => result.current.applyDraft(firstDraft));
    rerender({ serverDefinition: refreshedDefinition });

    expect(result.current.definition).toBe(firstDraft);

    act(() => result.current.applyDraft(newerDraft));
    act(() => result.current.clearDraftIfSaved(firstDraft));

    expect(result.current.definition).toBe(newerDraft);

    rerender({ serverDefinition: savedDefinition });
    act(() => result.current.clearDraftIfSaved(newerDraft));

    expect(result.current.definition).toBe(savedDefinition);
  });

  it("rejects an older save after a newer draft has completed", () => {
    const initialDefinition = definition("initial");
    const olderDraft = definition("older-local-edit");
    const newerDraft = definition("newer-local-edit");
    const savedDefinition = definition("saved-newer-edit");
    const { result, rerender } = renderHook(
      ({ serverDefinition }) =>
        useDashboardDefinitionDraft(serverDefinition, true),
      { initialProps: { serverDefinition: initialDefinition } },
    );

    act(() => result.current.applyDraft(olderDraft));
    act(() => result.current.applyDraft(newerDraft));

    let acceptedNewerSave: boolean | undefined;
    act(() => {
      acceptedNewerSave = result.current.clearDraftIfSaved(newerDraft);
    });
    rerender({ serverDefinition: savedDefinition });

    let acceptedOlderSave: boolean | undefined;
    act(() => {
      acceptedOlderSave = result.current.clearDraftIfSaved(olderDraft);
    });

    expect(acceptedNewerSave).toBe(true);
    expect(acceptedOlderSave).toBe(false);
    expect(result.current.definition).toBe(savedDefinition);
  });
});
