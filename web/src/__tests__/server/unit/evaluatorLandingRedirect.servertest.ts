import type { GetServerSidePropsContext } from "next";
import type * as SharedServer from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isForceV3ExperienceProjectMock } = vi.hoisted(() => ({
  isForceV3ExperienceProjectMock: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  isForceV3ExperienceProject: isForceV3ExperienceProjectMock,
}));

vi.mock("@/src/features/evals/v2/pages/EvaluatorsPage", () => ({
  default: () => null,
}));

import { getServerSideProps } from "@/src/pages/project/[projectId]/evals";

const makeContext = (projectId: string): GetServerSidePropsContext =>
  ({ params: { projectId } }) as unknown as GetServerSidePropsContext;

describe("evaluator landing page", () => {
  beforeEach(() => {
    isForceV3ExperienceProjectMock.mockReset();
  });

  it("redirects forced-v3 projects to legacy evaluator management", async () => {
    isForceV3ExperienceProjectMock.mockReturnValue(true);

    await expect(
      getServerSideProps(makeContext("project/id")),
    ).resolves.toEqual({
      redirect: {
        destination: "/project/project%2Fid/evals/legacy",
        permanent: false,
      },
    });
  });

  it("renders the V2 evaluator landing page for other projects", async () => {
    isForceV3ExperienceProjectMock.mockReturnValue(false);

    await expect(
      getServerSideProps(makeContext("project-id")),
    ).resolves.toEqual({ props: {} });
  });
});
