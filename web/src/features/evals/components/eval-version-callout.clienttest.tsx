import { EvalTargetObject } from "@langfuse/shared";
import { shouldHideEvalVersionCalloutForPreviewBanner } from "@/src/features/evals/components/eval-version-callout";

describe("shouldHideEvalVersionCalloutForPreviewBanner", () => {
  it("hides the observation SDK warning when the preview already shows it", () => {
    expect(
      shouldHideEvalVersionCalloutForPreviewBanner({
        targetObject: EvalTargetObject.EVENT,
        evalCapabilities: {
          compatibilityCheckWasPerformed: true,
          isNewCompatible: false,
        },
        previewTableVisible: true,
      }),
    ).toBe(true);
  });

  it("keeps the warning when the preview table is hidden", () => {
    expect(
      shouldHideEvalVersionCalloutForPreviewBanner({
        targetObject: EvalTargetObject.EVENT,
        evalCapabilities: {
          compatibilityCheckWasPerformed: true,
          isNewCompatible: false,
        },
        previewTableVisible: false,
      }),
    ).toBe(false);
  });

  it("keeps non-observation warnings visible", () => {
    expect(
      shouldHideEvalVersionCalloutForPreviewBanner({
        targetObject: EvalTargetObject.EXPERIMENT,
        evalCapabilities: {
          compatibilityCheckWasPerformed: true,
          isNewCompatible: false,
        },
        previewTableVisible: true,
      }),
    ).toBe(false);
  });
});
