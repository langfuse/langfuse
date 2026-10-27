import { describe, expect, it } from "vitest";

import { toBaseError } from "./toBaseError";

describe("toBaseError", () => {
  it.each([
    [404, "LangfuseNotFoundError", 404],
    [429, "TooManyRequestsError", 429],
    [502, "BadGatewayError", 502],
    [504, "GatewayTimeoutError", 504],
    [418, "InvalidRequestError", 400],
    [599, "InternalServerError", 500],
  ])("maps %i to %s", (status, name, httpCode) => {
    const error = toBaseError(status, "upstream said no");

    expect(error).toMatchObject({
      name,
      httpCode,
      message: "upstream said no",
    });
  });

  it("uses the error's default message when none is given", () => {
    expect(toBaseError(429).message).toBe("Too Many Requests");
  });
});
