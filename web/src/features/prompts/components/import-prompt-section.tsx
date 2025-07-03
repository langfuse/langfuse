import { useState, useRef } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { PromptType } from "@langfuse/shared";

interface PromptImportData {
  name: string;
  type: 'text' | 'chat';
  prompt: any;
  config: any;
  labels: string[];
  tags: string[];
  commitMessage?: string;
}

interface ImportPromptSectionProps {
  onImport: (data: PromptImportData) => void;
  isNewPrompt: boolean;
  existingPromptType?: PromptType;
}

export const ImportPromptSection: React.FC<ImportPromptSectionProps> = ({
  onImport,
  isNewPrompt,
  existingPromptType,
}) => {
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setError(null);
    setIsImporting(true);

    try {
      // Validate file type
      if (!file.name.endsWith('.json')) {
        throw new Error('Please select a JSON file');
      }

      // Validate file size (1MB limit)
      if (file.size > 1024 * 1024) {
        throw new Error('File size must be less than 1MB');
      }

      const text = await file.text();
      const data = JSON.parse(text) as PromptImportData;

      // Validate required fields
      if (!data.name || !data.type || data.prompt === undefined) {
        throw new Error('Invalid prompt format: missing required fields (name, type, prompt)');
      }

      // Validate prompt type
      if (!['text', 'chat'].includes(data.type)) {
        throw new Error('Invalid prompt type: must be "text" or "chat"');
      }

      // For new versions, validate type compatibility
      if (!isNewPrompt && existingPromptType && data.type !== existingPromptType) {
        throw new Error(
          `Type mismatch: imported prompt is "${data.type}" but existing prompt is "${existingPromptType}"`
        );
      }

      setImportedFile(file);
      onImport(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import file';
      setError(errorMessage);
      setImportedFile(null);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClearImport = () => {
    setImportedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Import from JSON</h3>
        {importedFile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearImport}
          >
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      {!importedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isImporting}
          />
          
          <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Drop a JSON file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              {isNewPrompt 
                ? "Import a prompt to populate the form with its data"
                : "Import a prompt version (type must match existing prompt)"
              }
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? "Processing..." : "Select File"}
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-muted/50">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">{importedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                Successfully imported • {(importedFile.size / 1024).toFixed(1)}KB
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && importedFile && (
        <Alert>
          <AlertDescription>
            {isNewPrompt 
              ? "Form has been populated with imported prompt data. Review and modify as needed."
              : "Form has been populated with imported prompt version data (name ignored for new version)."
            }
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};