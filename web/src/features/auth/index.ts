// The auth feature's public client surface (RFC rule 8): the client-safe half
// only — constants, the session hook and the zod schemas shared with forms.
//
// policy/ and createProjectMembershipsOnSignup deliberately stay deep imports.
// They reach Prisma and @langfuse/shared/src/server, so they belong behind a
// server surface, which means moving them under server/ first — a follow-up.
export { ENTERPRISE_SSO_REQUIRED_MESSAGE } from "@/src/features/auth/constants";
export { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
export { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
export { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
export { getAdClickIdsFromRequest } from "@/src/features/auth/lib/signupAttribution";
export type { AdClickIds } from "@/src/features/auth/lib/signupAttribution";
export {
  passwordSchema,
  signupSchema,
} from "@/src/features/auth/lib/signupSchema";
