import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { 
  replaceUrlTemplates, 
  prepareSpanDataForIframe,
  IframeMessageTypes,
  type IframeDataMessage,
  type IframeSettingsMessage,
  type IframeRequestDataMessage
} from "../utils/templateUtils";

interface SpanIframeRendererProps {
  config: {
    id: string;
    name: string;
    url: string;
  };
  observation: {
    id: string;
    input?: unknown;
    output?: unknown;
    metadata?: unknown;
  };
  className?: string;
}

export function SpanIframeRenderer({ 
  config, 
  observation, 
  className = "" 
}: SpanIframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { theme } = useTheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate the iframe URL with template replacements
  const iframeUrl = replaceUrlTemplates(config.url, {
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
  });

  // Prepare data for iframe messaging
  const spanData = prepareSpanDataForIframe(observation);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      setIsLoaded(true);
      setError(null);
      sendSettingsMessage();
      sendDataMessage();
    };

    const handleError = () => {
      setError("Failed to load iframe");
      setIsLoaded(false);
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
  }, [iframeUrl]);

  useEffect(() => {
    // Listen for messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security (optional - you might want to add allowlist)
      try {
        const iframe = iframeRef.current;
        if (!iframe || event.source !== iframe.contentWindow) {
          return;
        }

        const message = event.data as IframeRequestDataMessage;
        
        if (message.type === IframeMessageTypes.REQUEST_DATA) {
          sendDataMessage();
        }
        
        // Handle other message types as needed (e.g., update messages)
      } catch (error) {
        console.warn("Error handling iframe message:", error);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [spanData]);

  const sendMessage = (message: IframeSettingsMessage | IframeDataMessage) => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow && isLoaded) {
      try {
        iframe.contentWindow.postMessage(message, '*');
      } catch (error) {
        console.warn("Error sending message to iframe:", error);
      }
    }
  };

  const sendSettingsMessage = () => {
    const settingsMessage: IframeSettingsMessage = {
      type: IframeMessageTypes.SETTINGS,
      settings: {
        theme: theme === 'dark' ? 'dark' : 'light',
        readOnly: true, // For now, we'll make iframes read-only
      },
    };
    sendMessage(settingsMessage);
  };

  const sendDataMessage = () => {
    const dataMessage: IframeDataMessage = {
      type: IframeMessageTypes.DATA,
      data: spanData,
    };
    sendMessage(dataMessage);
  };

  // Re-send settings when theme changes
  useEffect(() => {
    if (isLoaded) {
      sendSettingsMessage();
    }
  }, [theme, isLoaded]);

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 border border-destructive/20 rounded-lg bg-destructive/5 ${className}`}>
        <div className="text-center">
          <p className="text-sm text-destructive mb-2">Failed to load iframe</p>
          <p className="text-xs text-muted-foreground">
            {config.name}: {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading {config.name}...</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        className="w-full h-full border-0 rounded-lg"
        sandbox="allow-scripts allow-same-origin"
        title={`${config.name} - Span ${observation.id}`}
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}