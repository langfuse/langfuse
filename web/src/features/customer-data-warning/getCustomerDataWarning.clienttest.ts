import { describe, expect, it } from "vitest";
import {
  customerDataWarningText,
  getCustomerDataWarning,
} from "./getCustomerDataWarning";

const viewingCustomerProject = {
  email: "ada@clickhouse.com",
  isAdmin: true,
  isLangfuseCloud: true,
  projectId: "proj_customer",
  organizationId: null,
  memberships: [{ id: "org_internal", projects: [{ id: "proj_internal" }] }],
  organizationName: "Acme",
  projectName: "Production",
};

describe("getCustomerDataWarning", () => {
  it("shows a project warning for a ClickHouse admin on Cloud who is not a member", () => {
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

  it("hides when the staff user is not an admin", () => {
    expect(
      getCustomerDataWarning({ ...viewingCustomerProject, isAdmin: false }),
    ).toBeNull();
  });

  it("shows for a non-admin staff user viewing through support access", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        isAdmin: false,
        memberships: [
          {
            id: "org_customer",
            projects: [{ id: "proj_customer" }],
            supportAccess: true,
          },
        ],
      }),
    ).toMatchObject({ scope: "project" });
  });

  it("shows an organization warning for a support access membership", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        isAdmin: false,
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

  it("hides when the admin is a genuine member of the project", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        memberships: [
          { id: "org_customer", projects: [{ id: "proj_customer" }] },
        ],
      }),
    ).toBeNull();
  });

  it("shows when the admin belongs to the organization but not this project", () => {
    expect(
      getCustomerDataWarning({
        ...viewingCustomerProject,
        memberships: [{ id: "org_customer", projects: [{ id: "proj_other" }] }],
      }),
    ).toMatchObject({ scope: "project" });
  });

  it("shows an organization warning when the admin is not a member of the org", () => {
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

  it("hides an organization route when the admin is a member", () => {
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
