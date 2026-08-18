import { Lightbulb } from "lucide-react";

import { EVALUATOR_GALLERY_CATEGORY_ICON_CLASS } from "@/src/features/evals/v2/constants/evaluatorGallery";
import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import {
  GALLERY_CATEGORY_ICONS,
  getGalleryCategoryPresentation,
} from "./galleryCategoryPresentation";

describe("galleryCategoryPresentation", () => {
  it("has an icon for every managed category", () => {
    for (const category of MANAGED_TEMPLATES_CATALOG.categories) {
      expect(GALLERY_CATEGORY_ICONS[category.key]).toBeDefined();
    }
  });

  it("has an icon color for every managed category", () => {
    for (const category of MANAGED_TEMPLATES_CATALOG.categories) {
      expect(EVALUATOR_GALLERY_CATEGORY_ICON_CLASS[category.key]).toBeDefined();
    }
  });

  it("uses a lightbulb for recommended, distinct from the LLM judge sparkle", () => {
    expect(getGalleryCategoryPresentation("recommended")).toEqual({
      icon: Lightbulb,
      iconClassName: "text-dark-yellow",
    });
  });
});
