import { describe, expect, it } from "vitest";
import {
  customerDataWarningText,
  getCustomerDataWarning,
} from "./getCustomerDataWarning";

// Staff user with a genuine internal membership plus a support access grant
// (which the session callback adds as a VIEWER membership) on the customer org.
const viewingCustomerProject = {
  email: "ada@clickhouse.com",
  isLangfuseCloud: true,
  projectId: "proj_customer",
  organizationId: null,
  memberships: [
    { id: "org_internal", projects: [{ id: "proj_internal" }] },
    {
      id: "org_customer",
      projects: [{ id: "proj_customer" }],
      supportAccess: true,
    },
  ],
  organizationName: "Acme",
  projectName: "Production",
};

describe("getCustomerDataWarning", () => {
  it("shows a project warning for a staff user on Cloud viewing through support access", () => {
    expect(getCustomerDataWarning(viewingCustomerProject)).toEqual({
      scope: "project",
      organizationName: "Acme",
      projectName: "Production",
    });
  });

  it.each(["Ada@ClickHouse.COM", "Ada@Langfuse.COM"])(
    "matches staff email %s case-insensitively",
    (email) => {
      expect(
        getCustomerDataWarning({
          ...viewingCustomerProject,
          email,
        }),
      ).toMatchObject({ scope: "project" });
    },
  );

  it.each([
    "ada@example.com",
    "ada@clickhouse.com.evil",
    "ada@langfuse.com.evil",
    null,
  ])("hides for email %s", (email) => {
    expect(
      getCustomerDataWarning({ ...viewingCustomerProject, email }),
    ).toBeNull();
  });

  it("hides when the staff user has no support access membership", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        memberships: [
          { id: "org_internal", projects: [{ id: "proj_internal" }] },
        ],
      }),
    ).toBeNull();
  });

  it("shows an organization warning for a support access membership", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        projectId: null,
        organizationId: "org_customer",
        projectName: null,
        memberships: [
          { id: "org_customer", projects: [], supportAccess: true },
        ],
      }),
    ).toMatchObject({ scope: "organization" });
  });

  it("hides on self-hosted deployments", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        isLangfuseCloud: false,
      }),
    ).toBeNull();
  });

  it("hides when the staff user is a genuine member of the project", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        memberships: [
          { id: "org_customer", projects: [{ id: "proj_customer" }] },
          { id: "org_other", projects: [], supportAccess: true },
        ],
      }),
    ).toBeNull();
  });

  it("shows when the staff user belongs to the organization but not this project", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        memberships: [
          { id: "org_customer", projects: [{ id: "proj_other" }] },
          {
            id: "org_customer",
            projects: [{ id: "proj_customer" }],
            supportAccess: true,
          },
        ],
      }),
    ).toMatchObject({ scope: "project" });
  });

  it("shows an organization warning when the staff user is not a member of the org", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        projectId: null,
        organizationId: "org_customer",
        projectName: null,
      }),
    ).toEqual({
      scope: "organization",
      organizationName: "Acme",
    });
  });

  it("hides an organization route when the staff user is a member", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        projectId: null,
        organizationId: "org_internal",
        projectName: null,
        organizationName: "Langfuse",
      }),
    ).toBeNull();
  });

  it("uses the project when the route has both a project and an organization", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        organizationId: "org_unrelated",
      }),
    ).toMatchObject({ scope: "project", projectName: "Production" });
  });

  it("hides when the route has no project or organization", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        projectId: null,
        organizationId: null,
      }),
    ).toBeNull();
  });

  it("hides a project warning until both names have loaded", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        projectName: null,
      }),
    ).toBeNull();
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        organizationName: null,
      }),
    ).toBeNull();
  });

  it("hides an organization warning until the organization name has loaded", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        projectId: null,
        organizationId: "org_customer",
        organizationName: null,
      }),
    ).toBeNull();
  });
});

describe("customerDataWarningText", () => {
  it("names the organization and project", () => {
    expect(
      customerDataWarningText({
        scope: "project",
        organizationName: "Acme",
        projectName: "Production",
      }),
    ).toBe(
      "You are viewing a customer project (Acme / Production). Treat all data as confidential.",
    );
  });

  it("names the organization on an organization route", () => {
    expect(
      customerDataWarningText({
        scope: "organization",
        organizationName: "Acme",
      }),
    ).toBe(
      "You are viewing a customer organization (Acme). Treat all data as confidential.",
    );
  });
});
