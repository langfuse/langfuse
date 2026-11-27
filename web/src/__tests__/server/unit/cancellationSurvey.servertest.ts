import { SurveyName } from "@langfuse/shared/src/db";

import { recordCancellationSurvey } from "@/src/ee/features/billing/server/cancellationSurvey";

type SurveyPrisma = Parameters<typeof recordCancellationSurvey>[0]["prisma"];

const setup = () => {
  const create = vi.fn().mockResolvedValue({ id: "survey-1" });
  return { create, prisma: { survey: { create } } as unknown as SurveyPrisma };
};

const user = { id: "user-1", email: "owner@example.com" };

describe("recordCancellationSurvey", () => {
  it("stores the reason, note, plan, billing system, placement and period end with the user and org", async () => {
    const { create, prisma } = setup();

    await recordCancellationSurvey({
      prisma,
      orgId: "org-1",
      user,
      feedback: { reason: "self_hosting", note: "Data must stay in our VPC" },
      placement: {
        reasonPosition: 3,
        reasonOrder: "not_using,too_expensive,self_hosting,other",
      },
      plan: "cloud:pro",
      billingProvider: "stripe",
      periodEnd: new Date("2026-12-26T00:00:00.000Z"),
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        surveyName: SurveyName.ORG_CANCELLATION,
        response: {
          reason: "self_hosting",
          note: "Data must stay in our VPC",
          plan: "cloud:pro",
          billingProvider: "stripe",
          reasonPosition: 3,
          reasonOrder: "not_using,too_expensive,self_hosting,other",
          periodEnd: "2026-12-26T00:00:00.000Z",
        },
        userId: "user-1",
        userEmail: "owner@example.com",
        orgId: "org-1",
      },
    });
  });

  it("leaves the note out when none was written, on ClickHouse billing too", async () => {
    const { create, prisma } = setup();

    await recordCancellationSurvey({
      prisma,
      orgId: "org-2",
      user: { id: "user-2" },
      feedback: { reason: "too_expensive" },
      plan: "cloud:team",
      billingProvider: "clickhouse",
      periodEnd: null,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        surveyName: SurveyName.ORG_CANCELLATION,
        response: {
          reason: "too_expensive",
          plan: "cloud:team",
          billingProvider: "clickhouse",
          periodEnd: null,
        },
        userId: "user-2",
        userEmail: null,
        orgId: "org-2",
      },
    });
  });
});
