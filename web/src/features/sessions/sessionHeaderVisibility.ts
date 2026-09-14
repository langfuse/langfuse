export const sessionHeaderDynamicDetailKey = (
  type: "metadata" | "score" | "user",
  identity: string,
) => {
  let firstFingerprint = 2_166_136_261;
  let secondFingerprint = 2_654_435_769;
  for (let index = 0; index < identity.length; index += 1) {
    const codeUnit = identity.charCodeAt(index);
    firstFingerprint = Math.imul(firstFingerprint ^ codeUnit, 16_777_619);
    secondFingerprint = Math.imul(secondFingerprint ^ codeUnit, 2_246_822_519);
  }
  return `${type}-${(firstFingerprint >>> 0).toString(36)}-${(secondFingerprint >>> 0).toString(36)}`;
};
