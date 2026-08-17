import {
  EVALUATOR_GALLERY_ALL_SECTION_KEY,
  EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";
import type {
  GalleryNavigationItem,
  GallerySection,
} from "@/src/features/evals/v2/types/templateGallery";

export function isGalleryAllSection(activeSection: string | null) {
  return !activeSection || activeSection === EVALUATOR_GALLERY_ALL_SECTION_KEY;
}

export function gallerySidebarItems(
  navigationItems: GalleryNavigationItem[],
  sections: GallerySection[],
): GalleryNavigationItem[] {
  const categoryItems = navigationItems.filter(
    (item) => item.key !== EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );
  const allCount = sections
    .filter(
      (section) => section.key !== EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
    )
    .reduce(
      (sum, section) => sum + (section.totalCount ?? section.templates.length),
      0,
    );

  return [
    {
      key: EVALUATOR_GALLERY_ALL_SECTION_KEY,
      label: "All",
      count: allCount,
    },
    ...categoryItems,
  ];
}

export function visibleGallerySections(
  sections: GallerySection[],
  activeSection: string | null,
): GallerySection[] {
  const recommendedSection = sections.find(
    (section) => section.key === EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );
  const remainingSections = sections.filter(
    (section) => section.key !== EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );
  const selectedSection = sections.find(
    (section) => section.key === activeSection,
  );

  if (isGalleryAllSection(activeSection) || !selectedSection) {
    return recommendedSection
      ? [recommendedSection, ...remainingSections]
      : remainingSections;
  }

  return [selectedSection];
}
