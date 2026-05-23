export type SpielwieseRouteSnapshot = {
  html: string;
  id: number;
  textSignature: string;
};

export function getRouteLayerTextSignature(element: HTMLElement | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function syncFormControlSnapshotValues(root: HTMLElement) {
  root.querySelectorAll("input").forEach((element) => {
    if (element.type === "checkbox" || element.type === "radio") {
      element.toggleAttribute("checked", element.checked);
      return;
    }

    element.setAttribute("value", element.value);
  });

  for (const textarea of root.querySelectorAll("textarea")) {
    textarea.textContent = textarea.value;
  }

  root.querySelectorAll("select").forEach((element) => {
    Array.from(element.options).forEach((option) => {
      option.toggleAttribute("selected", option.selected);
    });
  });
}

function stripSnapshotTestAttributes(root: HTMLElement) {
  root.removeAttribute("data-testid");
  root.removeAttribute("id");
  root.querySelectorAll("[data-testid]").forEach((element) => {
    element.removeAttribute("data-testid");
  });
  root.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
}

function stripSnapshotTransientElements(root: HTMLElement) {
  root.querySelectorAll('[role="progressbar"]').forEach((element) => {
    element.remove();
  });
}

export function captureRouteSnapshot(
  routeLayerElement: HTMLDivElement | null,
  id: number,
): SpielwieseRouteSnapshot | null {
  if (!routeLayerElement) {
    return null;
  }

  const snapshotElement = routeLayerElement.cloneNode(true) as HTMLElement;
  const textSignature = getRouteLayerTextSignature(routeLayerElement);

  snapshotElement.querySelectorAll("script").forEach((element) => {
    element.remove();
  });
  syncFormControlSnapshotValues(snapshotElement);
  stripSnapshotTransientElements(snapshotElement);
  stripSnapshotTestAttributes(snapshotElement);

  const html = snapshotElement.innerHTML.trim();

  return html.length > 0 ? { html, id, textSignature } : null;
}
