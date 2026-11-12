import * as z from "zod";

/**
 * Credit programs a coupon can be redeemed for. The value is the program type
 * sent to the GTM coupon endpoint, so renaming one is a contract change.
 */
export const COUPON_PROGRAMS = ["yc", "startup", "research"] as const;

export const CouponProgramSchema = z.enum(COUPON_PROGRAMS);

export type CouponProgram = z.infer<typeof CouponProgramSchema>;

export const COUPON_PROGRAM_LABELS: Record<CouponProgram, string> = {
  yc: "YC deal",
  startup: "Startup deal",
  research: "Research deal",
};

/** Codes are issued by hand per program, so only the shape is checked here. */
export const CouponCodeSchema = z
  .string()
  .trim()
  .min(1, "Enter a coupon code")
  .max(100, "Coupon codes are at most 100 characters");
