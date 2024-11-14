import { MediaContentType, MediaFileExtension } from "../validation";

export const getFileExtensionFromContentType = (
  contentType: MediaContentType,
): MediaFileExtension => {
  const mimeToExtension: Record<MediaContentType, MediaFileExtension> = {
    [MediaContentType.PNG]: MediaFileExtension.PNG,
    [MediaContentType.JPEG]: MediaFileExtension.JPEG,
    [MediaContentType.JPG]: MediaFileExtension.JPG,
    [MediaContentType.WEBP]: MediaFileExtension.WEBP,
    [MediaContentType.MP3]: MediaFileExtension.MP3,
    [MediaContentType.MP3_LEGACY]: MediaFileExtension.MP3,
    [MediaContentType.WAV]: MediaFileExtension.WAV,
    [MediaContentType.TXT]: MediaFileExtension.TXT,
    [MediaContentType.PDF]: MediaFileExtension.PDF,
  };

  const extension = mimeToExtension[contentType as MediaContentType];
  if (!extension) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  return extension;
};
