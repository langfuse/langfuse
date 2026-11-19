import * as z from "zod";

/** Codes are matched against the configured list on the server. */
export const CouponCodeSchema = z
  .string()
  .trim()
  .min(1, "Enter a coupon code")
  .max(100, "Coupon codes are at most 100 characters");
