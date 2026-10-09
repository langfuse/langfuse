import { ESLint } from "eslint";

const guardMessage =
  "Every toast must declare its static operation and errors/warnings must declare origin and category.";

const eslint = new ESLint({ cwd: process.cwd() });

const lintGuardMessages = async (code: string, filePath: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((message) =>
    message.message.includes(guardMessage),
  );
};

describe("toast ESLint guard", () => {
  it.each([
    [
      "aliased named import",
      'import { toast as notify } from "sonner"; notify.success("Saved");',
    ],
    [
      "namespace import",
      'import * as Sonner from "sonner"; Sonner.toast.error("Failed");',
    ],
    ["default import", 'import notify from "sonner"; notify("Saved");'],
    ["dynamic import", 'await import("sonner");'],
    ["CommonJS require", 'require("sonner");'],
    ["aliased re-export", 'export { toast as notify } from "sonner";'],
    ["namespace re-export", 'export * as Sonner from "sonner";'],
    ["star re-export", 'export * from "sonner";'],
  ])("rejects the %s bypass", async (_name, code) => {
    expect(
      await lintGuardMessages(code, "src/components/ui/button.tsx"),
    ).not.toHaveLength(0);
  });

  it("allows the Sonner Toaster component", async () => {
    expect(
      await lintGuardMessages(
        'import { Toaster as Sonner } from "sonner"; export const Toaster = Sonner;',
        "src/components/ui/sonner.tsx",
      ),
    ).toHaveLength(0);
  });

  it.each([
    "src/features/notifications/showErrorToast.tsx",
    "src/features/notifications/showSuccessToast.tsx",
    "src/features/notifications/showToast.tsx",
  ])("allows raw static imports in the %s seam", async (filePath) => {
    expect(
      await lintGuardMessages(
        'import { toast } from "sonner"; export const invoke = () => toast.success("Saved");',
        filePath,
      ),
    ).toHaveLength(0);
  });
});
