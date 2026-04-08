import { validateWebhookURL, whitelistFromEnv } from "../webhooks/validation";

const MAX_IMAGE_DATA_URL_BYTES = 5 * 1024 * 1024;
const IMAGE_DATA_URL_PREFIX = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/;
const BASE64_CHARS_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

const isValidBase64ImageDataUrl = (url: string): boolean => {
  if (!IMAGE_DATA_URL_PREFIX.test(url)) {
    return false;
  }

  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) {
    return false;
  }

  const base64Payload = url.slice(commaIndex + 1);
  if (base64Payload.length === 0) {
    return false;
  }

  if (!BASE64_CHARS_REGEX.test(base64Payload)) {
    return false;
  }

  if (base64Payload.length % 4 !== 0) {
    return false;
  }

  const padding = base64Payload.endsWith("==")
    ? 2
    : base64Payload.endsWith("=")
      ? 1
      : 0;
  const payloadBytes = Math.floor((base64Payload.length * 3) / 4) - padding;
  return payloadBytes <= MAX_IMAGE_DATA_URL_BYTES;
};

export const isValidImageUrl = async (url: string): Promise<boolean> => {
  if (IMAGE_DATA_URL_PREFIX.test(url)) {
    return isValidBase64ImageDataUrl(url);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  try {
    await validateWebhookURL(url, whitelistFromEnv());
    return true;
  } catch {
    return false;
  }
};
