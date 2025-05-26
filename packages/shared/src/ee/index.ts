import { logger } from "../server/logger";

export const isEE = true;

export const sum = async (a: number, b: number) => {
  try {
    if (isEE) {
      logger.info("isEE");
      const module = await import("../enterpriise/index.js");
      return module.sum(a, b) + 1;
    } else {
      logger.info("isFOSS");
      return undefined;
    }
  } catch (error) {
    logger.error(`error in sum: ${error}`);
    return undefined;
  }
};
