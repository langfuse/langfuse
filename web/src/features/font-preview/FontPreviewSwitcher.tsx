import { useEffect } from "react";

import { Layer } from "@/src/components/design-system/Layer/Layer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";

/** localStorage key; `_document.tsx` reads it before first paint. */
const STORAGE_KEY = "fontPreview";

/** Ids match the `data-font-preview` selectors in `globals.css`. */
const FONT_PREVIEWS = [
  { id: "system", label: "System" },
  { id: "public-sans", label: "Public Sans" },
  { id: "ibm-plex-sans", label: "IBM Plex Sans" },
  { id: "atkinson-hyperlegible-next", label: "Atkinson Hyperlegible" },
] as const;

type FontPreviewId = (typeof FONT_PREVIEWS)[number]["id"];

/** Floating control that flips the app between the UI font candidates. */
export function FontPreviewSwitcher() {
  const [selected, setSelected] = useLocalStorage<FontPreviewId>(
    STORAGE_KEY,
    "system",
  );

  // Syncs the `<html>` attribute that `globals.css` keys the font tokens on.
  useEffect(() => {
    document.documentElement.dataset.fontPreview = selected;
    return () => {
      delete document.documentElement.dataset.fontPreview;
    };
  }, [selected]);

  return (
    <Layer name="toast">
      <div
        role="radiogroup"
        aria-label="Font preview"
        className="bg-foreground text-background absolute bottom-6 left-1/2 flex max-w-full -translate-x-1/2 items-center gap-1 rounded-full p-1.5 shadow-lg"
      >
        <span className="px-3 text-base font-bold whitespace-nowrap">
          Font preview
        </span>
        {FONT_PREVIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected === id}
            onClick={() => setSelected(id)}
            className={cn(
              "focus-visible:ring-ring rounded-full px-4 py-2 text-base whitespace-nowrap focus-visible:ring-2 focus-visible:outline-hidden",
              selected === id
                ? "bg-background text-foreground font-bold"
                : "hover:bg-background/20",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </Layer>
  );
}
