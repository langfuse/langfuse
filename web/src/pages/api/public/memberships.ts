/**
 * This endpoint is used to manage project memberships.
 *
 * This is an EE feature and will return a 404 response if EE is not available.
 */

import { membershipsHandler } from "@/src/ee/membership-api/memberships-handler";

export default membershipsHandler;
