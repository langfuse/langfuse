import { Download } from "lucide-react";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

interface ExportPromptButtonProps {
  promptVersionId: string;
  projectId: string;
  promptName: string;
  promptVersion: number;
}

export const ExportPromptButton: React.FC<ExportPromptButtonProps> = ({
  promptVersionId,
  projectId,
  promptName,
  promptVersion,
}) => {
  const exportPromptQuery = api.prompts.export.useQuery(
    {
      projectId,
      promptVersionId,
    },
    {
      enabled: false,
    },
  );

  const handleExport = async () => {
    try {
      const data = await exportPromptQuery.refetch();
      
      if (!data.data) {
        throw new Error("Failed to export prompt");
      }

      // Create downloadable JSON file
      const jsonString = JSON.stringify(data.data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement("a");
      link.href = url;
      link.download = `${promptName}_v${promptVersion}.json`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccessToast({
        title: "Export successful",
        description: `Prompt version ${promptVersion} has been exported`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      showErrorToast({
        title: "Export failed",
        description: "There was an error exporting the prompt version",
      });
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exportPromptQuery.isLoading}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted"
    >
      <Download className="h-4 w-4" />
      {exportPromptQuery.isLoading ? "Exporting..." : "Export as JSON"}
    </button>
  );
};