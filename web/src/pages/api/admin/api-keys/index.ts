/**
 * This endpoint is used to add a new SSO configuration to the database.
 *
 * This is an EE feature and will return a 404 response if EE is not available.
 */

import { deleteApiKeys } from "@/src/ee/features/admin/api-keys/index";

export default deleteApiKeys;
