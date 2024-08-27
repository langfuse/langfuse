import * as DOMPurify from "dompurify";

// Create test cases
describe("should sanitize dom", () => {
  it("should sanitize urls", () => {
    const dirty =
      "http://www.some.site/page.html?default=<script>alert(document.cookie)</script>";
    const cleam = DOMPurify.sanitize(dirty);

    expect(cleam).toBe("http://www.some.site/page.html?default=");
  });
  it("should should not sanitize valid langfuse urls", () => {
    const validLangfuseUrl =
      "https://cloud.langfuse.com/project/abjdnksadn/traces?filter=timestamp%3Bdatetime%3B%3B%3E%3B2024-04-19T00%253A00%253A00.000Z%2Cid%3Bstring%3B%3Bcontains%3Ba%2Ctimestamp%3Bdatetime%3B%3B%3C%3B2024-04-30T22%253A00%253A00.000Z%2CinputTokens%3Bnumber%3B%3B%3E%3B1";
    const cleam = DOMPurify.sanitize(validLangfuseUrl);

    expect(cleam).toBe(validLangfuseUrl);
  });
});
