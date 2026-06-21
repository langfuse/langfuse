import { MediaContentType, MediaFileExtension } from "./validation";

const mimeToExtension: Record<string, string> = {
  [MediaContentType.PNG]: MediaFileExtension.PNG,
  [MediaContentType.JPEG]: MediaFileExtension.JPEG,
  [MediaContentType.JPG]: MediaFileExtension.JPG,
  [MediaContentType.WEBP]: MediaFileExtension.WEBP,
  [MediaContentType.GIF]: MediaFileExtension.GIF,
  [MediaContentType.SVG]: MediaFileExtension.SVG,
  [MediaContentType.TIFF]: MediaFileExtension.TIFF,
  [MediaContentType.BMP]: MediaFileExtension.BMP,
  [MediaContentType.AVIF]: MediaFileExtension.AVIF,
  [MediaContentType.HEIC]: MediaFileExtension.HEIC,
  [MediaContentType.MP3]: MediaFileExtension.MP3,
  [MediaContentType.MP3_LEGACY]: MediaFileExtension.MP3,
  [MediaContentType.WAV]: MediaFileExtension.WAV,
  [MediaContentType.OGG]: MediaFileExtension.OGG,
  [MediaContentType.OGA]: MediaFileExtension.OGA,
  [MediaContentType.AAC]: MediaFileExtension.AAC,
  [MediaContentType.M4A]: MediaFileExtension.M4A,
  [MediaContentType.FLAC]: MediaFileExtension.FLAC,
  [MediaContentType.OPUS]: MediaFileExtension.OPUS,
  [MediaContentType.WEBA]: MediaFileExtension.WEBA,
  [MediaContentType.MP4]: MediaFileExtension.MP4,
  [MediaContentType.WEBM]: MediaFileExtension.WEBM,
  [MediaContentType.VIDEO_OGG]: MediaFileExtension.OGV,
  [MediaContentType.MPEG]: MediaFileExtension.MPEG,
  [MediaContentType.MOV]: MediaFileExtension.MOV,
  [MediaContentType.AVI]: MediaFileExtension.AVI,
  [MediaContentType.MKV]: MediaFileExtension.MKV,
  [MediaContentType.TXT]: MediaFileExtension.TXT,
  [MediaContentType.HTML]: MediaFileExtension.HTML,
  [MediaContentType.CSS]: MediaFileExtension.CSS,
  [MediaContentType.CSV]: MediaFileExtension.CSV,
  [MediaContentType.MARKDOWN]: MediaFileExtension.MD,
  [MediaContentType.PYTHON]: MediaFileExtension.PY,
  [MediaContentType.JAVASCRIPT]: MediaFileExtension.JS,
  [MediaContentType.TYPESCRIPT]: MediaFileExtension.TS,
  [MediaContentType.YAML]: MediaFileExtension.YAML,
  [MediaContentType.PDF]: MediaFileExtension.PDF,
  [MediaContentType.DOC]: MediaFileExtension.DOC,
  [MediaContentType.XLS]: MediaFileExtension.XLS,
  [MediaContentType.XLSX]: MediaFileExtension.XLSX,
  [MediaContentType.ZIP]: MediaFileExtension.ZIP,
  [MediaContentType.JSON]: MediaFileExtension.JSON,
  [MediaContentType.XML]: MediaFileExtension.XML,
  [MediaContentType.BIN]: MediaFileExtension.BIN,
  [MediaContentType.DOCX]: MediaFileExtension.DOCX,
  [MediaContentType.PPTX]: MediaFileExtension.PPTX,
  [MediaContentType.RTF]: MediaFileExtension.RTF,
  [MediaContentType.JSONL]: MediaFileExtension.JSONL,
  [MediaContentType.PARQUET]: MediaFileExtension.PARQUET,
  [MediaContentType.GZIP]: MediaFileExtension.GZ,
  [MediaContentType.TAR]: MediaFileExtension.TAR,
  [MediaContentType.SEVEN_Z]: MediaFileExtension.SEVEN_Z,
};

/**
 * Returns a short, human-friendly file extension label for a given MIME content type.
 * Falls back to the MIME subtype (the part after '/') when the content type is not
 * in the known mapping, avoiding verbose labels like
 * "VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT".
 */
export function getFileExtensionLabel(contentType: string): string {
  const mapped = mimeToExtension[contentType];
  if (mapped) {
    return mapped.toUpperCase();
  }

  // Fallback: use MIME subtype but strip vendor/x- prefixes for readability
  const subtype = contentType.split("/")[1] ?? "FILE";
  return (
    subtype
      .replace(/^(vnd\.|x-)/i, "")
      .split(".")
      .pop()
      ?.toUpperCase() ?? "FILE"
  );
}
