// The auth feature's public client surface (RFC rule 8): the client-safe half
// only — the session hook and the zod schemas shared with forms.
//
// policy/, createProjectMembershipsOnSignup, signup attribution, and the
// enterprise SSO constant stay deep imports: server callers must not enter
// this client door (Turbopack RSC), and nothing else imports them through here.
export { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
export { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
export { projectRetentionSchema } from "@/src/features/auth/lib/projectRetentionSchema";
export type { AdClickIds } from "@/src/features/auth/lib/signupAttribution";
export { passwordSchema } from "@/src/features/auth/lib/signupSchema";
