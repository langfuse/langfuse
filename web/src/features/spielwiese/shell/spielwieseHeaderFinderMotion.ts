"use client";

type NullableElement<T extends HTMLElement> = T | null;

type FinderOpenAnimationElements = {
  panelBackground: NullableElement<HTMLDivElement>;
  panelInput: NullableElement<HTMLInputElement>;
  panelResults: NullableElement<HTMLDivElement>;
  panelSearchField: NullableElement<HTMLLabelElement>;
  panelShortcut: NullableElement<HTMLElement>;
  triggerBackground: NullableElement<HTMLElement>;
};

type FinderCloseAnimationElements = {
  triggerBackground: NullableElement<HTMLElement>;
  triggerIcon: NullableElement<SVGSVGElement>;
  triggerPlaceholder: NullableElement<HTMLElement>;
  triggerShortcut: NullableElement<HTMLElement>;
};

export type FinderCloseAnimationSnapshot = {
  searchFieldRect: DOMRect | null;
};

function animateElement(
  element: Element | null,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
) {
  if (!element || typeof element.animate !== "function") {
    return;
  }

  element.animate(keyframes, options);
}

function createMorphKeyframes(fromRect: DOMRect, toRect: DOMRect) {
  const translateX = fromRect.left - toRect.left;
  const translateY = fromRect.top - toRect.top;
  const scaleX = fromRect.width / toRect.width;
  const scaleY = fromRect.height / toRect.height;

  return [
    {
      transform: `translate(${translateX}px,${translateY}px) scale(${scaleX},${scaleY})`,
    },
    { transform: "none" },
  ];
}

export function captureFinderCloseAnimationSnapshot(
  panelSearchField: HTMLLabelElement | null,
): FinderCloseAnimationSnapshot {
  return {
    searchFieldRect: panelSearchField?.getBoundingClientRect() ?? null,
  };
}

export function playFinderOpenAnimation({
  panelBackground,
  panelInput,
  panelResults,
  panelSearchField,
  panelShortcut,
  triggerBackground,
}: FinderOpenAnimationElements) {
  const triggerRect = triggerBackground?.getBoundingClientRect();
  const panelRect = panelBackground?.getBoundingClientRect();

  if (triggerRect && panelRect) {
    animateElement(
      panelBackground,
      createMorphKeyframes(triggerRect, panelRect),
      {
        duration: 150,
        easing: "ease",
      },
    );
  }

  animateElement(panelBackground, [{ backgroundColor: "transparent" }, {}], {
    duration: 300,
    easing: "ease",
  });
  animateElement(
    panelInput,
    [{ transform: "translateX(-8px)" }, { transform: "none" }],
    { duration: 150, easing: "ease" },
  );
  animateElement(panelSearchField, [{ borderBottomColor: "transparent" }, {}], {
    delay: 50,
    duration: 250,
    easing: "ease",
    fill: "backwards",
  });
  animateElement(panelResults, [{ opacity: "0" }, {}], {
    delay: 50,
    duration: 250,
    easing: "ease",
    fill: "backwards",
  });
  animateElement(
    panelShortcut,
    [{ opacity: "0", transform: "translateX(-20%) scale(0.95)" }, {}],
    { delay: 50, duration: 250, easing: "ease", fill: "backwards" },
  );
}

export function playFinderCloseAnimation({
  snapshot,
  triggerBackground,
  triggerIcon,
  triggerPlaceholder,
  triggerShortcut,
}: FinderCloseAnimationElements & {
  snapshot: FinderCloseAnimationSnapshot;
}) {
  const triggerRect = triggerBackground?.getBoundingClientRect();

  if (snapshot.searchFieldRect && triggerRect) {
    animateElement(
      triggerBackground,
      createMorphKeyframes(snapshot.searchFieldRect, triggerRect),
      { duration: 150, easing: "ease" },
    );
  }

  animateElement(
    triggerIcon,
    [{ transform: "translateX(0px)" }, { transform: "none" }],
    { duration: 150, easing: "ease" },
  );
  animateElement(
    triggerPlaceholder,
    [{ transform: "translateX(8px)" }, { transform: "none" }],
    { duration: 150, easing: "ease" },
  );
  animateElement(
    triggerShortcut,
    [{ opacity: "0", transform: "translateX(30%) scale(0.95)" }, {}],
    { delay: 50, duration: 250, easing: "ease", fill: "backwards" },
  );
}
