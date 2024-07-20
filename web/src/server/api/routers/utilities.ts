import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { z } from "zod";

const isValidURL = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    return url.protocol === "https:";
  } catch (error) {
    console.log(error);
    return false;
  }
};

const isValidImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    // ensure image is not larger than 1MB in size
    if (contentLength && parseInt(contentLength, 10) > 1 * 1024 * 1024) {
      return false;
    }

    return !!contentType && contentType.startsWith("image/");
  } catch (error) {
    console.log(error);
    return false;
  }
};

export const utilsRouter = createTRPCRouter({
  validateImgUrl: protectedProcedure
    .input(z.string().url())
    .query(async ({ input: url }) => {
      if (!isValidURL(url)) {
        return { isValid: false };
      }

      const isValidImage = await isValidImageUrl(url);
      return { isValid: isValidImage };
    }),
});
