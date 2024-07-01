# Public API

## How to add new api routes

Implementation

- Wrap with `withMiddleware`
- Type-safe and authed API Route with `createAuthedAPIRoute`
- Add zod types to `/features/public-api/types` folder
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
