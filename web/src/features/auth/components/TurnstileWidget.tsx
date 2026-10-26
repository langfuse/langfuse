import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Button } from "@/src/components/ui/button";
import type { TurnstileAction } from "@/src/features/auth/constants";
import { useTheme } from "next-themes";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "compact" | "flexible";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

function turnstileTheme(
  resolvedTheme: string | undefined,
): "light" | "dark" | undefined {
  if (resolvedTheme === "dark") return "dark";
  if (resolvedTheme === "light") return "light";
  return undefined;
}

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      scriptPromise = null;
      script.remove();
      reject(new Error("Turnstile script loaded without its API"));
    };
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("Failed to load the Turnstile script"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type PendingToken = ((token: string | undefined) => void) | null;

function settlePending(
  pending: { current: PendingToken },
  token: string | undefined,
) {
  pending.current?.(token);
  pending.current = null;
}

export type TurnstileWidgetHandle = {
  /** Discards the current token (tokens are single-use) and re-runs the challenge. */
  reset: () => void;
  /**
   * Resolves with the next token the widget issues, including after the
   * widget re-renders for a new `action`. Resolves `undefined` if the
   * challenge fails or another caller starts waiting first.
   */
  nextToken: () => Promise<string | undefined>;
};

/**
 * Cloudflare Turnstile widget, rendered explicitly so it can be reset after
 * every submit on pages that stay mounted. Changing `action` re-renders the
 * widget so the next token carries the new action. `onTokenChange` receives
 * `undefined` whenever the current token is no longer usable.
 */
type TurnstileWidgetProps = {
  siteKey: string;
  action: TurnstileAction;
  onTokenChange: (token: string | undefined) => void;
  ref?: Ref<TurnstileWidgetHandle>;
};

export function TurnstileWidget({
  siteKey,
  action,
  onTokenChange,
  ref,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingTokenRef = useRef<PendingToken>(null);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { resolvedTheme } = useTheme();
  const theme = turnstileTheme(resolvedTheme);

  const handleToken = useEffectEvent((token: string | undefined) => {
    onTokenChange(token);
    if (token) settlePending(pendingTokenRef, token);
  });

  const handleError = useEffectEvent(() => {
    onTokenChange(undefined);
    settlePending(pendingTokenRef, undefined);
  });

  // Turnstile is an imperative third-party widget: render it into the
  // container on mount and remove it on unmount.
  useEffect(() => {
    if (!theme) return;
    let cancelled = false;
    setScriptFailed(false);
    // A new render issues a new token. Drop the previous one so the submit
    // button stays disabled until this widget shows its checkmark.
    handleToken(undefined);
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme,
          size: "flexible",
          callback: (token) => handleToken(token),
          "expired-callback": () => handleToken(undefined),
          "error-callback": () => handleError(),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setScriptFailed(true);
        handleError();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, loadAttempt, theme]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        onTokenChange(undefined);
        if (widgetIdRef.current) {
          window.turnstile?.reset(widgetIdRef.current);
        }
      },
      nextToken: () => {
        settlePending(pendingTokenRef, undefined);
        return new Promise<string | undefined>((resolve) => {
          pendingTokenRef.current = resolve;
        });
      },
    }),
    [onTokenChange],
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div ref={containerRef} className="min-h-[65px] w-full" />
      {scriptFailed ? (
        <Button
          type="button"
          variant="link"
          className="h-auto justify-start px-0"
          onClick={() => {
            scriptPromise = null;
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Captcha failed to load. Try again
        </Button>
      ) : null}
    </div>
  );
}
