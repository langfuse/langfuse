import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { ChatInterface } from "@/src/features/playground/components/chat-interface";
import { CompletionInterface } from "@/src/features/playground/components/completion-interface";
import {
  availableModels,
  availableModes,
  availableParameters,
  isAvailableMode,
  isAvailableModel,
  isAvailableProvider,
  type AvailableMode,
  type AvailableModel,
  type AvailableProvider,
} from "@/src/features/playground/types";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { nanoid, type Message } from "ai";
import { useCompletion } from "ai/react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

export function PlaygroundArea(props: { projectId: string }) {
  const router = useRouter();

  const playgroundHistoryId = useRef(
    typeof router.query.playgroundHistoryId === "string"
      ? router.query.playgroundHistoryId
      : undefined,
  );

  const [selectedMode, setSelectedMode] = useState<AvailableMode>(
    availableModes[0],
  );

  const [selectedModel, setSelectedModel] = useState<AvailableModel>(
    availableModels[0].model,
  );

  const [selectedProvider, setSelectedProvider] = useState<
    AvailableProvider | undefined
  >(availableModels[0].providers[0]);

  const [parameters, setParameters] = useState<Record<string, number>>({});

  const hasCUDAccess = useHasAccess({
    projectId: props.projectId,
    scope: "playground:CUD",
  });

  const [messages, setMessages] = useState<Message[]>([
    { id: "initial-0", role: "system", content: "" },
    { id: "initial-1", role: "user", content: "" },
  ]);

  const [prompt, setPrompt] = useState("");

  const [lastResponseMode, setLastResponseMode] = useState<AvailableMode>();

  const completingMessageId = useRef<string>("");

  const { completion, complete, stop } = useCompletion({
    api: `/api/completion/${selectedProvider}`,
    body: {
      playgroundHistoryId: playgroundHistoryId.current,
      projectId: props.projectId,
      mode: selectedMode,
      model: selectedModel,
      provider: selectedProvider,
      parameters,
      messages: selectedMode === "chat" ? messages : undefined,
      prompt: selectedMode === "completion" ? prompt : undefined,
    },
    onResponse(response) {
      if (response.ok) {
        if (response.headers.get("X-Mode") === "chat") {
          const newMessage: Message = {
            id: completingMessageId.current,
            role: "assistant",
            content: "",
          };
          setMessages((prev) => [...prev, newMessage]);
          setLastResponseMode("chat");
        } else if (response.headers.get("X-Mode") === "completion") {
          setLastResponseMode("completion");
        }
      }
    },
  });

  const utils = api.useUtils();
  const mutCreatePlaygroundHistory = api.playgroundHistories.create.useMutation(
    {
      onSuccess: async ({ id }) => {
        playgroundHistoryId.current = id;
        await router.push(
          {
            pathname: router.pathname,
            query: {
              ...router.query,
              playgroundHistoryId: playgroundHistoryId.current,
            },
          },
          undefined,
          { shallow: true },
        );
        await utils.playgroundHistories.invalidate();
        await complete("");
      },
      onError: (error) =>
        console.error("Error creating Playground History", error),
    },
  );

  useEffect(() => {
    if (selectedMode === "chat") {
      setMessages((prev) => {
        const lastMessage = prev.at(-1);
        if (lastMessage?.id === completingMessageId.current) {
          lastMessage.content = completion;
        }
        return prev;
      });
    }
  }, [selectedMode, completion]);

  const onModeSelection = (value: string) => {
    if (isAvailableMode(value)) {
      setSelectedMode((prev) => {
        if (prev !== value) {
          stop();
        }
        return value;
      });
      const firstModel = availableModels
        .filter((model) => model.modes.some((mode) => mode === value))
        .at(0)?.model;
      if (firstModel) {
        setSelectedModel(firstModel);
        setSelectedProvider(
          availableModels.find((model) => model.model === firstModel)
            ?.providers[0],
        );
      }
    } else {
      console.error(`Unexpected mode '${value}'`);
    }
  };

  const onModelSelection = (value: string) => {
    if (isAvailableModel(value)) {
      setSelectedModel(value);
      setSelectedProvider(
        availableModels.find((model) => model.model === value)?.providers[0],
      );
    } else {
      console.error(`Unexpected model '${value}'`);
    }
  };

  const onProviderSelection = (value: string) => {
    if (isAvailableProvider(value)) {
      setSelectedProvider(value);
    } else {
      console.error(`Unexpected provider '${value}'`);
    }
  };

  return (
    <div className="flex h-[calc(100%-90px)] flex-col space-y-2">
      <div className="flex items-center space-x-2">
        <Select value={selectedMode} onValueChange={onModeSelection}>
          <SelectTrigger className="w-max hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent position="popper" defaultValue={10}>
            {availableModes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedModel} onValueChange={onModelSelection}>
          <SelectTrigger className="w-max hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent position="popper" defaultValue={10}>
            {availableModels
              .filter((model) =>
                model.modes.some((mode) => mode === selectedMode),
              )
              .map(({ model }) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedProvider}
          onValueChange={onProviderSelection}
          disabled={!selectedModel}
        >
          <SelectTrigger className="w-max hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent position="popper" defaultValue={10}>
            {availableModels
              .find(({ model }) => model === selectedModel)
              ?.providers.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-0 grow gap-2">
        <div className="flex max-w-[calc(100%-160px)] grow flex-col">
          {selectedMode === "chat" ? (
            <ChatInterface
              hasCUDAccess={hasCUDAccess}
              messages={messages}
              setMessages={setMessages}
            />
          ) : (
            <CompletionInterface
              lastResponseMode={lastResponseMode}
              completion={completion}
              prompt={prompt}
              setPrompt={setPrompt}
            />
          )}
          <Button
            className="mt-4 self-stretch"
            variant="default"
            disabled={!hasCUDAccess || !selectedProvider}
            onClick={() => {
              completingMessageId.current = nanoid();
              mutCreatePlaygroundHistory.mutate({
                projectId: props.projectId,
                mode: selectedMode,
                model: selectedModel,
                provider: selectedProvider!,
                parameters,
                input:
                  selectedMode === "chat"
                    ? {
                        messages: messages.map(({ role, content }) => ({
                          role,
                          content,
                        })),
                      }
                    : { text: prompt },
              });
            }}
          >
            Submit
          </Button>
        </div>
        <div className="flex w-40 flex-col gap-2.5 overflow-y-auto px-1">
          {selectedProvider &&
            availableParameters[`${selectedMode}-${selectedProvider}`].map(
              ({ id, name, defaultValue, min, max, step }) => (
                <div key={id}>
                  {name}
                  <Input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    placeholder={
                      defaultValue !== undefined
                        ? defaultValue.toString()
                        : undefined
                    }
                    value={parameters[id]}
                    onChange={(e) =>
                      setParameters((prev) => ({
                        ...prev,
                        [id]:
                          prev[id] === undefined
                            ? defaultValue ?? min
                            : Number(e.target.value),
                      }))
                    }
                    onBlur={() =>
                      setParameters((prev) => {
                        const value = prev[id];
                        if (value === undefined) {
                          return prev;
                        }
                        if (value > max) {
                          prev[id] = max;
                        } else if (value < min) {
                          prev[id] = min;
                        }
                        return { ...prev };
                      })
                    }
                  />
                </div>
              ),
            )}
        </div>
      </div>
    </div>
  );
}
