import { Lightbulb } from "lucide-react";

import { MANAGED_TEMPLATES_CATALOG } from "@/src/features/evals/v2/constants/managedTemplatesCatalog";
import {
  GALLERY_CATEGORY_PRESENTATION,
  getGalleryCategoryPresentation,
} from "./galleryCategoryPresentation";

describe("galleryCategoryPresentation", () => {
  it("has an icon and color for every managed category", () => {
    for (const category of MANAGED_TEMPLATES_CATALOG.categories) {
      const presentation = GALLERY_CATEGORY_PRESENTATION[category.key];
      expect(presentation).toBeDefined();
      expect(presentation.icon).toBeDefined();
      expect(presentation.iconClassName).toBeDefined();
    }
  });

  it("uses a lightbulb for recommended, distinct from the LLM judge sparkle", () => {
    expect(getGalleryCategoryPresentation("recommended")).toEqual({
      icon: Lightbulb,
      iconClassName: "text-dark-yellow",
    });
  });
});
