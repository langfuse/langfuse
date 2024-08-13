# Entitlements

This feature allows to control for availability of features. Entitlements are managed on the `organization` level.

## Concepts

- `Plan`: A plan is a a tier of features. Eg. `oss`, `cloud:pro`, `self-hosted:enterprise`. They are managed in `constants/plans.ts`.
- `Entitlement`: An entitlement is a feature that is available to a user. Eg. `playground`. They are managed in `constants/entitlements.ts`. `entitlements.ts` also includes the mapping of entitlements to plans.

## How it works

- Plan is added to the organization object on the JWT via NextAuth.
- Mapping to entitlements
  - Client side: react hooks in `hooks.ts` make entitlements of current organization available to the components.
  - Server side: `hasEntitlement.ts` allows to check for an entitlement given a session user object.
