import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { BatchEvalSourceTable } from "@langfuse/shared";

import operationsUi from "@/src/features/i18n/messages/zh-CN/operationsUi.json";
import { DatasetChoiceStep } from "./AddObservationsToDatasetDialog/DatasetChoiceStep";
import { MappingModeSelector } from "./AddObservationsToDatasetDialog/components/MappingModeSelector";
import { ConfirmationStep } from "./RunEvaluationDialog/ConfirmationStep";

describe("batch action localization", () => {
  it("renders the dataset wizard and evaluation confirmation in Simplified Chinese", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={{ operationsUi }}>
        <DatasetChoiceStep onSelectMode={vi.fn()} />
        <MappingModeSelector
          value="custom"
          onChange={vi.fn()}
          fullLabel="完整观测输出"
          fieldName="output"
        />
        <ConfirmationStep
          projectId="project-1"
          displayCount={2}
          evaluators={[{ id: "evaluator-1", name: "质量评估" }]}
          hideCount={false}
          sourceTable={BatchEvalSourceTable.EXPERIMENTS}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("现有数据集")).toBeInTheDocument();
    expect(screen.getByText("新建数据集")).toBeInTheDocument();
    expect(screen.getByText("自定义映射")).toBeInTheDocument();
    expect(screen.getByText("无")).toBeInTheDocument();
    expect(screen.getByText("观测：")).toBeInTheDocument();
    expect(screen.getByText("无法估算实验范围评估的费用")).toBeInTheDocument();
  });
});
