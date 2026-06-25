import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import { type NextApiRequest } from "next";

const request = (method: string | undefined, url: string | undefined) =>
  ({ method, url }) as NextApiRequest;

describe("clickHouseRouteForRequest", () => {
  it("uses only the request pathname", () => {
    expect(
      clickHouseRouteForRequest(
        request(
          "GET",
          "/api/public/v2/traces?projectId=project-1&secret=do-not-log",
        ),
      ),
    ).toBe("GET /api/public/v2/traces");
  });

  it("removes search params from malformed urls in the fallback path", () => {
    expect(
      clickHouseRouteForRequest(
        request("POST", "http://[::1?secret=do-not-log#fragment"),
      ),
    ).toBe("POST http://[::1");
  });

  it("falls back to UNKNOWN method for missing methods", () => {
    expect(
      clickHouseRouteForRequest(request(undefined, "/api/public/health")),
    ).toBe("UNKNOWN /api/public/health");
  });
});
