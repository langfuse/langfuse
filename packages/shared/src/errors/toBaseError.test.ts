import { describe, expect, expectTypeOf, it } from "vitest";

import { BaseError } from "./BaseError";
import { TooManyRequestsError } from "./TooManyRequestsError";
import { toBaseError } from "./toBaseError";

describe("toBaseError", () => {
  it.each([
    [404, "LangfuseNotFoundError"],
    [429, "TooManyRequestsError"],
    [502, "BadGatewayError"],
    [504, "GatewayTimeoutError"],
    [418, "HttpError"],
    [599, "HttpError"],
  ])("maps %i to %s", (status, name) => {
    const error = toBaseError(status, "upstream said no");

    expect(error).toBeInstanceOf(BaseError);
    expect(error).toMatchObject({
      name,
      httpCode: status,
      message: "upstream said no",
    });
  });

  it("uses the error's default message when none is given", () => {
    expect(toBaseError(429).message).toBe("Too Many Requests");
    expect(toBaseError(418).message).toBe("HTTP 418");
  });

  it("types a literal status as its mapped error", () => {
    expectTypeOf(toBaseError(429)).toEqualTypeOf<TooManyRequestsError>();
    expectTypeOf(toBaseError(418)).toEqualTypeOf<BaseError>();
    expectTypeOf(toBaseError(Number("429"))).toEqualTypeOf<BaseError>();
  });
});
