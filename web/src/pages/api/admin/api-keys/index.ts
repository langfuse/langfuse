/**
 * This endpoint is used to remove API keys from the database and from Redis
 *
 * This is an EE feature and will return a 404 response if EE is not available.
 */

import deleteApiKeys from "@/src/ee/features/admin/api-keys";

export default deleteApiKeys;
