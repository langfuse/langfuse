type RoleHandoffRectSnapshot = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type RoleHandoffSnapshot = {
  sourceModalRect: RoleHandoffRectSnapshot;
  sourceNodeRect: RoleHandoffRectSnapshot;
  targetNodeId: string;
};

export type RoleHandoffMarkup = {
  modalHtml: string;
  nodeHtml: string;
};

export type RoleHandoffTransition = {
  markup: RoleHandoffMarkup;
  snapshot: RoleHandoffSnapshot;
};

function getRectSnapshot(rect: DOMRect): RoleHandoffRectSnapshot {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function removeCloneSelectors(root: HTMLElement) {
  root.removeAttribute("data-spielwiese-node-id");
  root.removeAttribute("data-testid");
  root.removeAttribute("id");
  root.setAttribute("aria-hidden", "true");

  root.querySelectorAll("[data-spielwiese-node-id]").forEach((element) => {
    element.removeAttribute("data-spielwiese-node-id");
  });
  root.querySelectorAll("[data-testid]").forEach((element) => {
    element.removeAttribute("data-testid");
  });
  root.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
}

function getFormControls(root: HTMLElement) {
  const controls = [
    root,
    ...Array.from(root.querySelectorAll("input, textarea, select")),
  ];

  return controls.filter(
    (
      element,
    ): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement,
  );
}

function syncClonedFormState({
  clone,
  source,
}: {
  clone: HTMLElement;
  source: HTMLElement;
}) {
  const sourceControls = getFormControls(source);
  const cloneControls = getFormControls(clone);

  sourceControls.forEach((sourceControl, index) => {
    const cloneControl = cloneControls[index];

    if (!cloneControl) {
      return;
    }

    if (
      sourceControl instanceof HTMLInputElement &&
      cloneControl instanceof HTMLInputElement
    ) {
      cloneControl.value = sourceControl.value;
      cloneControl.setAttribute("value", sourceControl.value);
      cloneControl.checked = sourceControl.checked;
      if (sourceControl.checked) {
        cloneControl.setAttribute("checked", "");
      } else {
        cloneControl.removeAttribute("checked");
      }
      return;
    }

    if (
      sourceControl instanceof HTMLTextAreaElement &&
      cloneControl instanceof HTMLTextAreaElement
    ) {
      cloneControl.value = sourceControl.value;
      cloneControl.textContent = sourceControl.value;
      return;
    }

    if (
      sourceControl instanceof HTMLSelectElement &&
      cloneControl instanceof HTMLSelectElement
    ) {
      cloneControl.value = sourceControl.value;
      Array.from(cloneControl.options).forEach((option) => {
        if (option.value === sourceControl.value) {
          option.setAttribute("selected", "");
          return;
        }

        option.removeAttribute("selected");
      });
    }
  });
}

function freezeCloneDimensions({
  clone,
  source,
}: {
  clone: HTMLElement;
  source: HTMLElement;
}) {
  const cloneRect = source.getBoundingClientRect();
  const cloneElement = clone;

  if (cloneRect.width > 0) {
    cloneElement.style.width = `${cloneRect.width}px`;
    cloneElement.style.minWidth = `${cloneRect.width}px`;
    cloneElement.style.maxWidth = `${cloneRect.width}px`;
  }

  if (cloneRect.height > 0) {
    cloneElement.style.height = `${cloneRect.height}px`;
    cloneElement.style.minHeight = `${cloneRect.height}px`;
    cloneElement.style.maxHeight = `${cloneRect.height}px`;
  }
}

function cloneHandoffElement(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;

  syncClonedFormState({
    clone,
    source: element,
  });
  freezeCloneDimensions({
    clone,
    source: element,
  });
  removeCloneSelectors(clone);

  clone.style.margin = "0";
  clone.style.pointerEvents = "none";

  return clone;
}

export function captureRoleHandoffTransition({
  nodeId,
}: {
  nodeId: string;
}): RoleHandoffTransition | null {
  const node = document.querySelector(
    `[data-testid="spielwiese-onboarding-upper-canvas"] [data-spielwiese-node-id="${nodeId}"] [data-testid="spielwiese-agent-node-card-deck"]`,
  ) as HTMLElement | null;
  const modal = document.querySelector(
    '[data-testid="spielwiese-model-picker-panel"]',
  ) as HTMLElement | null;

  if (!node || !modal) {
    return null;
  }

  return {
    markup: {
      modalHtml: cloneHandoffElement(modal).outerHTML,
      nodeHtml: cloneHandoffElement(node).outerHTML,
    },
    snapshot: {
      sourceModalRect: getRectSnapshot(modal.getBoundingClientRect()),
      sourceNodeRect: getRectSnapshot(node.getBoundingClientRect()),
      targetNodeId: nodeId,
    },
  };
}
