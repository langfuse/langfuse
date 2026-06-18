import { EvalTemplateType } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  deleteEvalTemplatesByIds,
  findDefaultModelEvalTemplateIds,
  findEvalTemplateById,
  findEvalTemplateFamilyVersions,
  findJobConfigurationsReferencingEvalTemplates,
  lockEvalTemplateFamilyVersions,
} from "@/src/features/evals/server/evaluatorRepository";

const __orgIds: string[] = [];
const __managedTemplateIds: string[] = [];

const prepareProject = async () => {
  const { project, org } = await createOrgProjectAndApiKey();
  __orgIds.push(org.id);
  return project;
};

const createTemplate = async (data: {
  projectId: string | null;
  name: string;
  version?: number;
  type?: EvalTemplateType;
  provider?: string | null;
  model?: string | null;
}) => {
  const template = await prisma.evalTemplate.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      version: data.version ?? 1,
      type: data.type ?? EvalTemplateType.LLM_AS_JUDGE,
      provider: data.provider ?? null,
      model: data.model ?? null,
      prompt: "test prompt",
    },
  });

  // managed templates are global and not covered by the org cleanup
  if (!data.projectId) __managedTemplateIds.push(template.id);

  return template;
};

const createJobConfiguration = (params: {
  projectId: string;
  evalTemplateId: string;
  scoreName: string;
}) =>
  prisma.jobConfiguration.create({
    data: {
      projectId: params.projectId,
      jobType: "EVAL",
      evalTemplateId: params.evalTemplateId,
      scoreName: params.scoreName,
      filter: [],
      targetObject: "trace",
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "INACTIVE",
      timeScope: ["NEW"],
    },
  });

describe("evaluatorRepository", () => {
  afterAll(async () => {
    await prisma.evalTemplate.deleteMany({
      where: { id: { in: __managedTemplateIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: __orgIds } },
    });
  });

  describe("findDefaultModelEvalTemplateIds", () => {
    it("only returns LLM-as-judge templates that depend on the default model", async () => {
      const project = await prepareProject();
      const dependentTemplate = await createTemplate({
        projectId: project.id,
        name: "default-model-dependent",
      });
      const templateWithOwnModel = await createTemplate({
        projectId: project.id,
        name: "own-model",
        provider: "openai",
        model: "gpt-4.1",
      });
      const codeTemplate = await createTemplate({
        projectId: project.id,
        name: "code-template",
        type: EvalTemplateType.CODE,
      });

      const ids = await findDefaultModelEvalTemplateIds({
        tx: prisma,
        projectId: project.id,
      });

      expect(ids).toContain(dependentTemplate.id);
      expect(ids).not.toContain(templateWithOwnModel.id);
      expect(ids).not.toContain(codeTemplate.id);
    });
  });

  describe("findEvalTemplateById", () => {
    it("returns the template or null", async () => {
      const project = await prepareProject();
      const template = await createTemplate({
        projectId: project.id,
        name: "find-by-id",
      });

      await expect(
        findEvalTemplateById({ tx: prisma, id: template.id }),
      ).resolves.toMatchObject({ id: template.id, name: "find-by-id" });
      await expect(
        findEvalTemplateById({ tx: prisma, id: "non-existent-id" }),
      ).resolves.toBeNull();
    });
  });

  describe("findEvalTemplateFamilyVersions", () => {
    it("returns all versions of the name+type family within the project", async () => {
      const project = await prepareProject();
      const v1 = await createTemplate({
        projectId: project.id,
        name: "family",
        version: 1,
      });
      const v2 = await createTemplate({
        projectId: project.id,
        name: "family",
        version: 2,
      });
      // same name but different type belongs to another family
      const codeSibling = await createTemplate({
        projectId: project.id,
        name: "family-code",
        type: EvalTemplateType.CODE,
      });
      const otherName = await createTemplate({
        projectId: project.id,
        name: "other-family",
      });

      const versions = await findEvalTemplateFamilyVersions({
        tx: prisma,
        projectId: project.id,
        name: "family",
        type: EvalTemplateType.LLM_AS_JUDGE,
      });

      const versionIds = versions.map((version) => version.id);
      expect(versionIds).toHaveLength(2);
      expect(versionIds).toEqual(expect.arrayContaining([v1.id, v2.id]));
      expect(versionIds).not.toContain(codeSibling.id);
      expect(versionIds).not.toContain(otherName.id);
    });

    it("resolves langfuse-managed families via null projectId", async () => {
      const managedName = `managed-family-${Date.now()}`;
      const managed = await createTemplate({
        projectId: null,
        name: managedName,
      });

      const versions = await findEvalTemplateFamilyVersions({
        tx: prisma,
        projectId: null,
        name: managedName,
        type: EvalTemplateType.LLM_AS_JUDGE,
      });

      expect(versions.map((version) => version.id)).toEqual([managed.id]);
    });
  });

  describe("findJobConfigurationsReferencingEvalTemplates", () => {
    it("returns the referencing job configurations of the project", async () => {
      const project = await prepareProject();
      const v1 = await createTemplate({
        projectId: project.id,
        name: "referenced",
        version: 1,
      });
      const v2 = await createTemplate({
        projectId: project.id,
        name: "referenced",
        version: 2,
      });
      const config = await createJobConfiguration({
        projectId: project.id,
        evalTemplateId: v1.id,
        scoreName: "referenced-score",
      });

      await expect(
        findJobConfigurationsReferencingEvalTemplates({
          tx: prisma,
          projectId: project.id,
          evalTemplateIds: [v1.id, v2.id],
        }),
      ).resolves.toEqual([{ id: config.id, scoreName: "referenced-score" }]);

      await expect(
        findJobConfigurationsReferencingEvalTemplates({
          tx: prisma,
          projectId: project.id,
          evalTemplateIds: [v2.id],
        }),
      ).resolves.toEqual([]);
    });
  });

  describe("deleteEvalTemplatesByIds", () => {
    it("deletes the given templates but never crosses project boundaries", async () => {
      const project = await prepareProject();
      const otherProject = await prepareProject();
      const template = await createTemplate({
        projectId: project.id,
        name: "to-delete",
      });
      const otherProjectTemplate = await createTemplate({
        projectId: otherProject.id,
        name: "to-delete",
      });

      await deleteEvalTemplatesByIds({
        tx: prisma,
        projectId: project.id,
        evalTemplateIds: [template.id, otherProjectTemplate.id],
      });

      await expect(
        prisma.evalTemplate.findUnique({ where: { id: template.id } }),
      ).resolves.toBeNull();
      await expect(
        prisma.evalTemplate.findUnique({
          where: { id: otherProjectTemplate.id },
        }),
      ).resolves.not.toBeNull();
    });
  });

  describe("lockEvalTemplateFamilyVersions", () => {
    // runs on its own pooled connection, so it competes with the
    // transaction's locks; NOWAIT makes lock contention fail immediately
    // instead of blocking
    const lockRowNoWait = (id: string) =>
      prisma.$queryRaw`SELECT id FROM eval_templates WHERE id = ${id} FOR UPDATE NOWAIT`;

    it("locks every version of the family until the transaction ends", async () => {
      const project = await prepareProject();
      const v1 = await createTemplate({
        projectId: project.id,
        name: "locked-template",
        version: 1,
      });
      const v2 = await createTemplate({
        projectId: project.id,
        name: "locked-template",
        version: 2,
      });
      const unrelatedTemplate = await createTemplate({
        projectId: project.id,
        name: "unlocked-template",
      });

      await prisma.$transaction(async (tx) => {
        await lockEvalTemplateFamilyVersions({
          tx,
          projectId: project.id,
          name: "locked-template",
          type: EvalTemplateType.LLM_AS_JUDGE,
        });

        // no other connection can lock any version of the family
        await expect(lockRowNoWait(v1.id)).rejects.toThrow(
          /could not obtain lock/,
        );
        await expect(lockRowNoWait(v2.id)).rejects.toThrow(
          /could not obtain lock/,
        );
        // templates outside the family stay lockable
        await expect(
          lockRowNoWait(unrelatedTemplate.id),
        ).resolves.toBeDefined();
      });

      // locks are released once the transaction commits
      await expect(lockRowNoWait(v1.id)).resolves.toBeDefined();
    });
  });
});
