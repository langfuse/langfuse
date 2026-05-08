import type { GetServerSidePropsContext } from "next";

const mockGetServerAuthSession = vi.fn();
const mockJobConfigurationFindUnique = vi.fn();

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: (...args: unknown[]) =>
    mockGetServerAuthSession(...args),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobConfiguration: {
      findUnique: (...args: unknown[]) =>
        mockJobConfigurationFindUnique(...args),
    },
  },
}));

import { getServerSideProps } from "../../../pages/project/[projectId]/evals/configs/[configId]";

const projectId = "project-123";
const evaluatorId = "eval-config-123";

const createContext = (
  params: GetServerSidePropsContext["params"] = {
    projectId,
    configId: evaluatorId,
  },
): GetServerSidePropsContext =>
  ({
    params,
    query: params ?? {},
    req: {},
    res: {},
    resolvedUrl: `/project/${projectId}/evals/configs/${evaluatorId}`,
  }) as GetServerSidePropsContext;

const createSession = (projects: Array<{ id: string }> = [{ id: projectId }]) =>
  ({
    user: {
      id: "user-123",
      email: "user@example.com",
      admin: false,
      organizations: [
        {
          id: "org-123",
          projects,
        },
      ],
    },
  }) as Awaited<ReturnType<typeof mockGetServerAuthSession>>;

describe("eval config redirect getServerSideProps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns notFound without querying evaluator existence when unauthenticated", async () => {
    mockGetServerAuthSession.mockResolvedValueOnce(null);
    mockJobConfigurationFindUnique.mockResolvedValueOnce({ id: evaluatorId });

    await expect(getServerSideProps(createContext())).resolves.toEqual({
      notFound: true,
    });

    expect(mockJobConfigurationFindUnique).not.toHaveBeenCalled();
  });

  it("returns notFound without querying evaluator existence for non-members", async () => {
    mockGetServerAuthSession.mockResolvedValueOnce(createSession([]));
    mockJobConfigurationFindUnique.mockResolvedValueOnce({ id: evaluatorId });

    await expect(getServerSideProps(createContext())).resolves.toEqual({
      notFound: true,
    });

    expect(mockJobConfigurationFindUnique).not.toHaveBeenCalled();
  });

  it("returns notFound for project members when the evaluator is missing", async () => {
    mockGetServerAuthSession.mockResolvedValueOnce(createSession());
    mockJobConfigurationFindUnique.mockResolvedValueOnce(null);

    await expect(getServerSideProps(createContext())).resolves.toEqual({
      notFound: true,
    });

    expect(mockJobConfigurationFindUnique).toHaveBeenCalledWith({
      where: {
        id: evaluatorId,
        projectId,
      },
      select: {
        id: true,
      },
    });
  });

  it("redirects project members when the evaluator exists", async () => {
    mockGetServerAuthSession.mockResolvedValueOnce(createSession());
    mockJobConfigurationFindUnique.mockResolvedValueOnce({ id: evaluatorId });

    await expect(getServerSideProps(createContext())).resolves.toEqual({
      redirect: {
        destination: `/project/${projectId}/evals/${evaluatorId}`,
        permanent: false,
      },
    });
  });
});
