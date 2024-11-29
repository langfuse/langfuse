import { MediaContentType, MediaFileExtension } from "../validation";

export const getFileExtensionFromContentType = (
  contentType: MediaContentType,
): MediaFileExtension => {
  const mimeToExtension: Record<MediaContentType, MediaFileExtension> = {
    [MediaContentType.PNG]: MediaFileExtension.PNG,
    [MediaContentType.JPEG]: MediaFileExtension.JPEG,
    [MediaContentType.JPG]: MediaFileExtension.JPG,
    [MediaContentType.WEBP]: MediaFileExtension.WEBP,
    [MediaContentType.GIF]: MediaFileExtension.GIF,
    [MediaContentType.SVG]: MediaFileExtension.SVG,
    [MediaContentType.TIFF]: MediaFileExtension.TIFF,
    [MediaContentType.BMP]: MediaFileExtension.BMP,
    [MediaContentType.MP3]: MediaFileExtension.MP3,
    [MediaContentType.MP3_LEGACY]: MediaFileExtension.MP3,
    [MediaContentType.WAV]: MediaFileExtension.WAV,
    [MediaContentType.OGG]: MediaFileExtension.OGG,
    [MediaContentType.OGA]: MediaFileExtension.OGA,
    [MediaContentType.AAC]: MediaFileExtension.AAC,
    [MediaContentType.M4A]: MediaFileExtension.M4A,
    [MediaContentType.FLAC]: MediaFileExtension.FLAC,
    [MediaContentType.MP4]: MediaFileExtension.MP4,
    [MediaContentType.WEBM]: MediaFileExtension.WEBM,
    [MediaContentType.TXT]: MediaFileExtension.TXT,
    [MediaContentType.HTML]: MediaFileExtension.HTML,
    [MediaContentType.CSS]: MediaFileExtension.CSS,
    [MediaContentType.CSV]: MediaFileExtension.CSV,
    [MediaContentType.PDF]: MediaFileExtension.PDF,
    [MediaContentType.DOC]: MediaFileExtension.DOC,
    [MediaContentType.XLS]: MediaFileExtension.XLS,
    [MediaContentType.ZIP]: MediaFileExtension.ZIP,
    [MediaContentType.JSON]: MediaFileExtension.JSON,
    [MediaContentType.XML]: MediaFileExtension.XML,
    [MediaContentType.BIN]: MediaFileExtension.BIN,
  };

  const extension = mimeToExtension[contentType as MediaContentType];
  if (!extension) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  return extension;
};
