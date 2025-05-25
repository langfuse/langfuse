import React from "react";
import { Globe, Key } from "lucide-react";

interface WebhookActionConfigProps {
  config: {
    type: "WEBHOOK";
    url: string;
    headers: Record<string, string>;
  };
}

export const WebhookActionConfig: React.FC<WebhookActionConfigProps> = ({
  config,
}) => {
  return (
    <div className="space-y-3">
      <div>
        <h5 className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" />
          Webhook URL
        </h5>
        <p className="break-all font-mono text-sm text-muted-foreground">
          {config.url}
        </p>
      </div>

      {config.headers && Object.keys(config.headers).length > 0 && (
        <div>
          <h5 className="flex items-center gap-2 text-sm font-medium">
            <Key className="h-4 w-4" />
            Headers
          </h5>
          <div className="mt-2 space-y-1">
            {Object.entries(config.headers).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-muted-foreground">{key}:</span>
                <span className="font-mono text-muted-foreground">
                  {value as string}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
