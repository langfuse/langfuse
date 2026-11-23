# Entitlements

This feature allows to control for availability of features. Entitlements are managed on the `organization` level.

## Concepts

- `Plan`: A plan is a a tier of features. Eg. `oss`, `cloud:pro`, `self-hosted:enterprise`. They are managed in `plans.ts`.
- `Entitlement`: An entitlement is a feature that is available to a user. Eg. `playground`. They are managed in `packages/shared/src/features/entitlements/entitlements.ts`, which also maps entitlements to plans and exports `hasEntitlementBasedOnPlan`.
  - `EntitlementLimit`: An entitlement limit is a limit on the number of resources that can be created/used. Eg. `annotation-queue-count`. They are managed in the same shared file.

## How it works

- Plan
  - Cloud: added to the organization object on the JWT via NextAuth
  - Self-hosted
    - Added to JWT via NextAuth on `environment` as `selfHostedInstancePlan`
    - In addition, also added to the organization object on the JWT via NextAuth
    - Available based on license key outside of TRPC apis and react hooks via `getSelfHostedInstancePlanServerSide`
  - Use of plan
    - Hook: `usePlan`
    - Server side (web and worker): `getOrganizationPlanServerSide` based on cloudConfig, or `getSelfHostedInstancePlanServerSide` for instance-level plan, both from `@langfuse/shared/src/server`
- Use of Entitlements
  - Client side: react hooks in `hooks.ts` make entitlements of current organization available to the components.
  - Server side: `hasEntitlement.ts` and `hasEntitlementLimit.ts` allow to check for entitlements and entitlement limits given a session user object.
