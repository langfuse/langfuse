import { type NextApiResponse } from "next";
import { createResponse } from "node-mocks-http";

import { ForbiddenError } from "@langfuse/shared";
import {
  writeOrgError,
  writeProjectError,
  writeScimError,
} from "@/src/features/public-api/server/writeError";

describe.each([
  {
    name: "organization",
    write: writeOrgError,
    field: "error",
    envelope: {},
  },
  {
    name: "project",
    write: writeProjectError,
    field: "message",
    envelope: {},
  },
  {
    name: "SCIM",
    write: writeScimError,
    field: "detail",
    envelope: {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: 403,
    },
  },
])("$name authorization error response", ({ write, field, envelope }) => {
  it("preserves the required permission", () => {
    const description =
      'Access denied. The "projects:read" permission is required to access this resource.';
    const res = createResponse<NextApiResponse>();

    write(res, new ForbiddenError(description));

    expect(res.statusCode).toBe(403);
    expect(res._getJSONData()).toEqual({
      ...envelope,
      [field]: description,
    });
  });
});
