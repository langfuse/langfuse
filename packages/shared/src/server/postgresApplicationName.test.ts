import { describe, expect, it } from "vitest";

import { VERSION } from "../constants/VERSION";
import { withPostgresApplicationName } from "./postgresApplicationName";

const applicationName = `application_name=${encodeURIComponent(`langfuse/${VERSION.replace("v", "")}`)}`;

describe("withPostgresApplicationName", () => {
  it("adds application_name to a URL without query parameters", () => {
    expect(
      withPostgresApplicationName(
        "postgresql://postgres:postgres@localhost:5432/postgres",
      ),
    ).toBe(
      `postgresql://postgres:postgres@localhost:5432/postgres?${applicationName}`,
    );
  });

  it("appends application_name after existing query parameters", () => {
    expect(
      withPostgresApplicationName(
        "postgresql://u:p%40ss@db:5432/langfuse?schema=public&sslmode=require",
      ),
    ).toBe(
      `postgresql://u:p%40ss@db:5432/langfuse?schema=public&sslmode=require&${applicationName}`,
    );
  });

  it("keeps an application_name already set in the URL", () => {
    const url =
      "postgresql://postgres:postgres@localhost:5432/postgres?application_name=custom";
    expect(withPostgresApplicationName(url)).toBe(url);
  });

  it("returns an unset URL unchanged", () => {
    expect(withPostgresApplicationName(undefined)).toBeUndefined();
  });
});
