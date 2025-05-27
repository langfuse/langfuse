import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { type UseFormReturn } from "react-hook-form";
import { WebhookActionForm } from "./actions/WebhookActionForm";
import { AnnotationQueueActionForm } from "./actions/AnnotationQueueActionForm";

interface ActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  activeTab: string;
  onActionTypeChange: (value: string) => void;
}

export const ActionForm: React.FC<ActionFormProps> = ({
  form,
  disabled,
  projectId,
  activeTab,
  onActionTypeChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Action</CardTitle>
        <CardDescription>
          Configure what happens when the trigger fires.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="actionType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Action Type</FormLabel>
              <Select
                onValueChange={onActionTypeChange}
                value={field.value}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an action type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="WEBHOOK">Webhook</SelectItem>
                  <SelectItem value="ANNOTATION_QUEUE">
                    Annotation Queue
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The type of action to perform when the trigger fires.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator className="my-4" />

        {activeTab === "webhook" && (
          <WebhookActionForm form={form} disabled={disabled} />
        )}

        {activeTab === "annotation_queue" && (
          <AnnotationQueueActionForm
            form={form}
            disabled={disabled}
            projectId={projectId}
          />
        )}
      </CardContent>
    </Card>
  );
};
