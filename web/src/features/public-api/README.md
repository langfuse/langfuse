# Public API

## How to add new api routes

Implementation

- Wrap with `withMiddleware`
- Type-safe and authed API Route with `createAuthedAPIRoute`
- Add zod types to `/features/public-api/types` folder.

  - Use [`coerce`](https://zod.dev/?id=coercion-for-primitives) to handle primitives, such as dates, for use in your application and tests.
  - Use `strict()` on all objects that should not return additional properties. Recommended as default. In these cases, the test utility `makeZodVerifiedAPICall` will throw an error if the response contains additional properties. Also, we will log an error in production if the response contains additional properties.

- Throw errors defined in `shared/src/errors` which translate to HTTP status codes

Testing

- Add tests for all standard cases
- use `makeZodVerifiedAPICall` to test the API response against the zod response schema

API Reference

- Add to `fern` including `docs` attributes
- Build with `fern generate --api server` and `fern generate --api client`, then commit the changes to the API reference

SDKs

- Copy/paste fern-generated types or api reference to Python and JS SDKs respectively
- Implement wrapping functions if needed

How to refactor existing apis to this pattern

1. Move request types to `features/public-api/types`
2. Create response types in `features/public-api/types`
3. Validate response type with `validateZodSchema` in the API route to get type warnings in case of mismatch
4. Refactor api route by passing current api route to LLM together with example of e.g. public/v2/datasets.ts
