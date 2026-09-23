import { type SkillDraftFile } from "../components/skillEditorStore";

export function isSkillImageFile(
  file: Pick<SkillDraftFile, "path" | "contentType">,
): boolean {
  const contentType = file.contentType.split(";")[0]!.trim().toLowerCase();
  return (
    /^image\/(png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/.test(
      contentType,
    ) || /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(file.path)
  );
}
