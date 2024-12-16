# Entitlements

This feature allows to control for availability of features. Entitlements are managed on the `organization` level.

## Concepts

- `Plan`: A plan is a a tier of features. Eg. `oss`, `cloud:pro`, `self-hosted:enterprise`. They are managed in `plans.ts`.
- `Entitlement`: An entitlement is a feature that is available to a user. Eg. `playground`. They are managed in `constants/entitlements.ts`. `entitlements.ts` also includes the mapping of entitlements to plans.
  - `EntitlementLimit`: An entitlement limit is a limit on the number of resources that can be created/used. Eg. `annotation-queue-count`. They are managed in `constants/entitlements.ts`.

## How it works

- Plan
  - Cloud: added to the organization object on the JWT via NextAuth
  - Self-hosted
    - Added to JWT via NextAuth on `environment` as `selfHostedInstancePlan`
    - In addition, also added to the organization object on the JWT via NextAuth
    - Available based on license key outside of TRPC apis and react hooks via `getSelfHostedInstancePlanServerSide`
  - Use of plan
    - Hook: `usePlan`
    - Server side: `getOrganizationPlanServerSide` based on cloudConfig, or `getSelfHostedInstancePlanServerSide` for instance-level plan
- Use of Entitlements
  - Client side: react hooks in `hooks.ts` make entitlements of current organization available to the components.
  - Server side: `hasEntitlement.ts` and `hasEntitlementLimit.ts` allow to check for entitlements and entitlement limits given a session user object.
