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

  it("uses a category-colored edge for recommended cards", () => {
    expect(getGalleryCategoryPresentation("recommended").edgeClassName).toBe(
      "border-l-dark-yellow",
    );
  });
});
