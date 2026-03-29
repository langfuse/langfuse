import { getFileExtensionLabel } from "./getFileExtensionLabel";
import { MediaContentType } from "./validation";

describe("getFileExtensionLabel", () => {
  describe("image content types", () => {
    it.each([
      [MediaContentType.PNG, "PNG"],
      [MediaContentType.JPEG, "JPEG"],
      [MediaContentType.JPG, "JPG"],
      [MediaContentType.WEBP, "WEBP"],
      [MediaContentType.GIF, "GIF"],
      [MediaContentType.SVG, "SVG"],
      [MediaContentType.TIFF, "TIFF"],
      [MediaContentType.BMP, "BMP"],
      [MediaContentType.AVIF, "AVIF"],
      [MediaContentType.HEIC, "HEIC"],
    ])("should return correct label for %s", (contentType, expected) => {
      expect(getFileExtensionLabel(contentType)).toBe(expected);
    });
  });

  describe("audio content types", () => {
    it.each([
      [MediaContentType.MP3, "MP3"],
      [MediaContentType.MP3_LEGACY, "MP3"],
      [MediaContentType.WAV, "WAV"],
      [MediaContentType.OGG, "OGG"],
      [MediaContentType.OGA, "OGA"],
      [MediaContentType.AAC, "AAC"],
      [MediaContentType.M4A, "M4A"],
      [MediaContentType.FLAC, "FLAC"],
      [MediaContentType.OPUS, "OPUS"],
      [MediaContentType.WEBA, "WEBA"],
    ])("should return correct label for %s", (contentType, expected) => {
      expect(getFileExtensionLabel(contentType)).toBe(expected);
    });
  });

  describe("video content types", () => {
    it.each([
      [MediaContentType.MP4, "MP4"],
      [MediaContentType.WEBM, "WEBM"],
      [MediaContentType.VIDEO_OGG, "OGV"],
      [MediaContentType.MPEG, "MPEG"],
      [MediaContentType.MOV, "MOV"],
      [MediaContentType.AVI, "AVI"],
      [MediaContentType.MKV, "MKV"],
    ])("should return correct label for %s", (contentType, expected) => {
      expect(getFileExtensionLabel(contentType)).toBe(expected);
    });
  });

  describe("text content types", () => {
    it.each([
      [MediaContentType.TXT, "TXT"],
      [MediaContentType.HTML, "HTML"],
      [MediaContentType.CSS, "CSS"],
      [MediaContentType.CSV, "CSV"],
      [MediaContentType.MARKDOWN, "MD"],
      [MediaContentType.PYTHON, "PY"],
      [MediaContentType.JAVASCRIPT, "JS"],
      [MediaContentType.TYPESCRIPT, "TS"],
    ])("should return correct label for %s", (contentType, expected) => {
      expect(getFileExtensionLabel(contentType)).toBe(expected);
    });
  });

  describe("document and application content types", () => {
    it.each([
      [MediaContentType.PDF, "PDF"],
      [MediaContentType.DOC, "DOC"],
      [MediaContentType.DOCX, "DOCX"],
      [MediaContentType.XLS, "XLS"],
      [MediaContentType.XLSX, "XLSX"],
      [MediaContentType.PPTX, "PPTX"],
      [MediaContentType.RTF, "RTF"],
      [MediaContentType.JSON, "JSON"],
      [MediaContentType.JSONL, "JSONL"],
      [MediaContentType.XML, "XML"],
      [MediaContentType.YAML, "YAML"],
      [MediaContentType.PARQUET, "PARQUET"],
    ])("should return correct label for %s", (contentType, expected) => {
      expect(getFileExtensionLabel(contentType)).toBe(expected);
    });
  });

  describe("archive and binary content types", () => {
    it.each([
      [MediaContentType.ZIP, "ZIP"],
      [MediaContentType.GZIP, "GZ"],
      [MediaContentType.TAR, "TAR"],
      [MediaContentType.SEVEN_Z, "7Z"],
      [MediaContentType.BIN, "BIN"],
    ])("should return correct label for %s", (contentType, expected) => {
      expect(getFileExtensionLabel(contentType)).toBe(expected);
    });
  });

  describe("fallback for unknown MIME types", () => {
    it("should strip vendor prefix and return last segment", () => {
      expect(
        getFileExtensionLabel(
          "application/vnd.custom-vendor.spreadsheet.format",
        ),
      ).toBe("FORMAT");
    });

    it("should strip x- prefix from unknown types", () => {
      expect(getFileExtensionLabel("application/x-custom")).toBe("CUSTOM");
    });

    it("should handle simple unknown subtypes", () => {
      expect(getFileExtensionLabel("application/foobar")).toBe("FOOBAR");
    });

    it("should handle unknown image subtypes", () => {
      expect(getFileExtensionLabel("image/x-icon")).toBe("ICON");
    });

    it("should return FILE when subtype is missing", () => {
      expect(getFileExtensionLabel("application")).toBe("FILE");
    });
  });

  describe("edge cases", () => {
    it("should return FILE for an empty string", () => {
      expect(getFileExtensionLabel("")).toBe("FILE");
    });

    it("should handle a slash with no subtype", () => {
      expect(getFileExtensionLabel("image/")).toBe("");
    });

    it("should handle content type with extra segments after slash", () => {
      expect(getFileExtensionLabel("type/sub.part")).toBe("PART");
    });
  });
});
