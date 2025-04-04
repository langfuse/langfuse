/**
 * This hook is used to determine if an element is or was visible in the viewport.
 * It is useful for determining if a component is visible in the viewport, or if it was visible in the viewport at any point in time.
 */

import { type RefObject, useEffect, useMemo, useState } from "react";

export function useElementIsVisible<T extends HTMLElement>(ref: RefObject<T>) {
  const [isVisible, setIsVisible] = useState(false);

  const observer = useMemo(
    () =>
      new IntersectionObserver((entries) => {
        let visible = false;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible = true;
          }
        });
        setIsVisible(visible);
      }),
    [],
  );

  useEffect(() => {
    if (ref.current && observer) {
      observer.observe(ref.current);
      return () => observer.disconnect();
    }
  }, [observer, ref]);

  return isVisible;
}

export function useElementWasVisible<T extends HTMLElement>(ref: RefObject<T>) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  const observer = useMemo(
    () =>
      new IntersectionObserver((entries) => {
        let visible = false;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible = true;
          }
        });
        setHasBeenVisible(visible);
      }),
    [],
  );

  useEffect(() => {
    if (ref.current && observer) {
      if (!hasBeenVisible) {
        observer.observe(ref.current);
      } else {
        observer.disconnect();
      }
      return () => observer.disconnect();
    }
  }, [observer, ref, hasBeenVisible]);

  return hasBeenVisible;
}
