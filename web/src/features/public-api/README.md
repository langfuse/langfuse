## Caching Strategy of API Keys

### Cache Structure

The cache for API keys is managed using Redis. The cache key looks like the following: `api-key:<secret-key>:`. The hash is the `fastHashedSecretKey` from postgres. Hence, we can easily find the key in Redis.

### Creation and updates of API keys

When creating a new API key, nothing happens in the cache. The API key is only created in the database. There are no functionalities in Langfuse to update API keys.

### Reading API keys

When reading API keys, we prefer to get the key from Redis and reset the TTL (time-to-live) on each read to ensure it remains in the cache. If the key is not found in Redis, we read from Postgres and store it in the cache.
