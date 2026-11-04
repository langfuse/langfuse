import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { type RouterOutputs } from "@/src/utils/api";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  testProject: vi.fn(),
  updateProject: vi.fn(),
  testUpdateProject: vi.fn(),
  reportNonTrpcError: vi.fn(),
  reportTrpcErrorWithoutToast: vi.fn(),
}));

// The form reads the cloud region once at import; pin it so the suite does not
// depend on a developer's local .env.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = await importOriginal<{ env: Record<string, unknown> }>();
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, key) =>
        key === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"
          ? undefined
          : Reflect.get(target, key),
    }),
  };
});

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => {
  const mutation = { useMutation: () => ({ mutateAsync: vi.fn() }) };
  return {
    api: {
      llmApiKey: {
        all: { useQuery: () => ({ data: { data: [] } }) },
        create: {
          useMutation: () => ({ mutateAsync: mocks.createProject }),
        },
        update: {
          useMutation: () => ({ mutateAsync: mocks.updateProject }),
        },
        test: {
          useMutation: () => ({ mutateAsync: mocks.testProject }),
        },
        testUpdate: {
          useMutation: () => ({ mutateAsync: mocks.testUpdateProject }),
        },
      },
      organizationLlmApiKey: {
        all: { useQuery: () => ({ data: { data: [] } }) },
        create: mutation,
        update: mutation,
        test: mutation,
        testUpdate: mutation,
      },
      useUtils: () => ({
        llmApiKey: { invalidate: vi.fn() },
        organizationLlmApiKey: { invalidate: vi.fn() },
      }),
    },
    reportNonTrpcError: mocks.reportNonTrpcError,
    reportTrpcErrorWithoutToast: mocks.reportTrpcErrorWithoutToast,
  };
});

describe("CreateLLMApiKeyForm", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.testProject.mockResolvedValue({ success: true });
    mocks.testUpdateProject.mockResolvedValue({ success: true });
    mocks.createProject.mockResolvedValue({});
    mocks.updateProject.mockResolvedValue({});
  });

  it("restores a TypeSafe connection's custom base URL after switching upstreams", () => {
    const existingKey = {
      id: "key",
      projectId: "project",
      provider: "jev-via-proxy",
      adapter: "typesafe",
      baseURL: "https://gateway.example.com/v1",
      displaySecretKey: "...test",
      customModels: [],
      withDefaultModels: true,
      extraHeaderKeys: [],
    } as unknown as RouterOutputs["llmApiKey"]["all"]["data"][number];

    render(
      <CreateLLMApiKeyForm
        owner={{ scope: "project", projectId: "project" }}
        onSuccess={vi.fn()}
        customization={null}
        mode="update"
        existingKey={existingKey}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.click(screen.getByRole("radio", { name: "OpenRouter" }));
    expect(
      screen.queryByRole("textbox", { name: "Custom base URL" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));

    expect(
      screen.getByRole("textbox", { name: "Custom base URL" }),
    ).toHaveValue("https://gateway.example.com/v1");
  });

  it("shows save errors in the form instead of reporting a toast", async () => {
    const error = new Error(
      "Project and organization connections with the same provider name must use the same adapter.",
    );
    mocks.createProject.mockRejectedValue(error);

    render(
      <CreateLLMApiKeyForm
        owner={{ scope: "project", projectId: "project" }}
        onSuccess={vi.fn()}
        customization={null}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Provider name" }), {
      target: { value: "shared-provider" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create connection" }));

    expect(await screen.findByText(error.message)).toBeInTheDocument();
    expect(mocks.reportTrpcErrorWithoutToast).toHaveBeenCalledWith(
      error,
      "llm-api-keys",
    );
    expect(mocks.reportNonTrpcError).not.toHaveBeenCalled();
  });

  describe("OAuth2 authentication", () => {
    const renderCreateForm = () =>
      render(
        <CreateLLMApiKeyForm
          owner={{ scope: "project", projectId: "project" }}
          onSuccess={vi.fn()}
          customization={null}
        />,
        { wrapper: LayerProvider },
      );

    const renderUpdateForm = (existingKey: Record<string, unknown>) =>
      render(
        <CreateLLMApiKeyForm
          owner={{ scope: "project", projectId: "project" }}
          onSuccess={vi.fn()}
          customization={null}
          mode="update"
          existingKey={
            {
              id: "key",
              projectId: "project",
              provider: "gateway",
              baseURL: "https://gateway.example.com/v1",
              customModels: [],
              withDefaultModels: true,
              extraHeaderKeys: [],
              ...existingKey,
            } as unknown as RouterOutputs["llmApiKey"]["all"]["data"][number]
          }
        />,
        { wrapper: LayerProvider },
      );

    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    const choose = (select: string, option: string) => {
      fireEvent.click(screen.getByRole("combobox", { name: select }));
      fireEvent.click(screen.getByRole("option", { name: option }));
    };

    const optionLabels = (select: string) => {
      fireEvent.click(screen.getByRole("combobox", { name: select }));
      return screen.getAllByRole("option").map((option) => option.textContent);
    };

    const switchTo = (tab: "API key" | "OAuth 2.0") =>
      fireEvent.mouseDown(screen.getByRole("tab", { name: tab }));

    const submittedInput = async (mock: typeof mocks.testProject) => {
      await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
      return mock.mock.calls[0][0];
    };

    it("shows the Entra fields and the resolved token endpoint", () => {
      renderCreateForm();
      switchTo("OAuth 2.0");
      choose("Identity provider", "Microsoft Entra ID");

      type("Tenant ID", "contoso-tenant");
      type("Client ID", "agent-x");
      type("Scope", "api://gateway/.default");

      expect(
        screen.getByText(
          "https://login.microsoftonline.com/contoso-tenant/oauth2/v2.0/token",
        ),
      ).toBeInTheDocument();
    });

    it("offers no JWT credential for Cognito", () => {
      renderCreateForm();
      switchTo("OAuth 2.0");
      choose("Identity provider", "Amazon Cognito");

      expect(optionLabels("Credential")).toEqual([
        "Client secret (HTTP Basic)",
        "Client secret (request body)",
      ]);
    });

    it("asks for a private JWK and offers key algorithms for Custom private_key_jwt", () => {
      renderCreateForm();
      switchTo("OAuth 2.0");
      choose("Identity provider", "Custom");
      choose("Credential", "private_key_jwt");

      expect(screen.getByLabelText("Private JWK (JSON)").tagName).toBe(
        "TEXTAREA",
      );
      expect(screen.queryByLabelText("Client secret")).not.toBeInTheDocument();
      const algorithms = optionLabels("Assertion algorithm");
      expect(algorithms).toContain("PS256");
      expect(algorithms).not.toContain("HS256");
    });

    it("submits the Entra OAuth2 config", async () => {
      renderCreateForm();
      type("Provider name", "gateway");
      switchTo("OAuth 2.0");
      choose("Identity provider", "Microsoft Entra ID");
      type("Tenant ID", "contoso-tenant");
      type("Client ID", "agent-x");
      type("Scope", "api://gateway/.default");
      type("Client secret", "client-secret-value");

      fireEvent.click(
        screen.getByRole("button", { name: "Create connection" }),
      );

      const input = await submittedInput(mocks.testProject);
      expect(input.secretKey).toBe("client-secret-value");
      expect(input.config).toStrictEqual({
        useResponsesApi: false,
        oauth2: {
          provider: "entra",
          clientId: "agent-x",
          authMethod: "client_secret_post",
          tenantId: "contoso-tenant",
          scope: "api://gateway/.default",
        },
      });
    });

    it("submits the Custom OAuth2 config without empty optional values", async () => {
      renderCreateForm();
      type("Provider name", "gateway");
      switchTo("OAuth 2.0");
      choose("Identity provider", "Custom");
      type("Token endpoint", "https://login.example.com/as/token.oauth2");
      type("Client ID", "agent-x");
      choose("Credential", "private_key_jwt");
      choose("Assertion algorithm", "PS256");
      fireEvent.click(
        screen.getByRole("switch", { name: /Send client_id with assertion/ }),
      );
      type("Private JWK (JSON)", '{"kty":"RSA","d":"x"}');

      fireEvent.click(
        screen.getByRole("button", { name: "Create connection" }),
      );

      const input = await submittedInput(mocks.testProject);
      expect(input.secretKey).toBe('{"kty":"RSA","d":"x"}');
      expect(input.config.oauth2).toStrictEqual({
        provider: "custom",
        clientId: "agent-x",
        authMethod: "private_key_jwt",
        tokenEndpoint: "https://login.example.com/as/token.oauth2",
        assertionAlgorithm: "PS256",
        sendClientIdWithAssertion: true,
      });
    });

    it("sends no OAuth2 config after switching back to API key", async () => {
      renderCreateForm();
      type("Provider name", "gateway");
      switchTo("OAuth 2.0");
      type("Client ID", "agent-x");
      switchTo("API key");
      type("API Key", "sk-test");

      fireEvent.click(
        screen.getByRole("button", { name: "Create connection" }),
      );

      const input = await submittedInput(mocks.testProject);
      expect(input.secretKey).toBe("sk-test");
      expect(input.config).toBeUndefined();
    });

    it("clears a typed secret when the credential changes", () => {
      renderCreateForm();
      switchTo("OAuth 2.0");
      choose("Identity provider", "Okta");
      type("Client secret", "client-secret-value");

      choose("Credential", "Certificate (private key)");

      expect(screen.getByLabelText("Private JWK (JSON)")).toHaveValue("");
    });

    it("clears a typed secret when the identity provider changes", () => {
      renderCreateForm();
      switchTo("OAuth 2.0");
      type("Client secret", "client-secret-value");

      choose("Identity provider", "Okta");

      expect(screen.getByLabelText("Client secret")).toHaveValue("");
    });

    describe("editing an existing OAuth2 connection", () => {
      const storedOAuth2 = {
        provider: "okta",
        clientId: "agent-x",
        authMethod: "client_secret_basic",
        domain: "acme.okta.com",
        scope: "llm.invoke",
      };

      it("starts on OAuth2 with the stored values and keeps the secret when none is typed", async () => {
        renderUpdateForm({
          adapter: "openai",
          displaySecretKey: "...cret",
          config: { useResponsesApi: true, oauth2: storedOAuth2 },
        });

        expect(screen.getByRole("tab", { name: "OAuth 2.0" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        expect(screen.getByLabelText("Domain")).toHaveValue("acme.okta.com");
        expect(screen.getByLabelText("Client secret")).toHaveAttribute(
          "placeholder",
          "...cret",
        );

        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        const input = await submittedInput(mocks.testUpdateProject);
        expect(input.secretKey).toBe("");
        expect(input.config).toStrictEqual({
          useResponsesApi: true,
          oauth2: storedOAuth2,
        });
        await waitFor(() =>
          expect(mocks.updateProject).toHaveBeenCalledWith(
            expect.objectContaining({
              secretKey: "",
              config: { useResponsesApi: true, oauth2: storedOAuth2 },
            }),
          ),
        );
      });

      it("sends a new secret with the stored config and only the edited field changed", async () => {
        renderUpdateForm({
          adapter: "anthropic",
          displaySecretKey: "...cret",
          config: { oauth2: storedOAuth2 },
        });

        type("Scope", "llm.invoke llm.read");
        type("Client secret", "new-client-secret");
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        const input = await submittedInput(mocks.testUpdateProject);
        expect(input.secretKey).toBe("new-client-secret");
        expect(input.config).toStrictEqual({
          oauth2: { ...storedOAuth2, scope: "llm.invoke llm.read" },
        });
      });

      it("replaces the stored Anthropic OAuth2 config when switching to an API key", async () => {
        renderUpdateForm({
          adapter: "anthropic",
          displaySecretKey: "...cret",
          config: { oauth2: storedOAuth2 },
        });

        switchTo("API key");
        type("API Key", "sk-ant-new");
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        const input = await submittedInput(mocks.testUpdateProject);
        expect(input.secretKey).toBe("sk-ant-new");
        expect(input.config).toStrictEqual({});
        await waitFor(() =>
          expect(mocks.updateProject).toHaveBeenCalledWith(
            expect.objectContaining({ secretKey: "sk-ant-new", config: {} }),
          ),
        );
      });

      it("drops the stored OpenAI OAuth2 config when switching to an API key", async () => {
        renderUpdateForm({
          adapter: "openai",
          displaySecretKey: "...cret",
          config: { useResponsesApi: true, oauth2: storedOAuth2 },
        });

        switchTo("API key");
        type("API Key", "sk-new");
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        const input = await submittedInput(mocks.testUpdateProject);
        expect(input.secretKey).toBe("sk-new");
        expect(input.config).toStrictEqual({ useResponsesApi: true });
        await waitFor(() =>
          expect(mocks.updateProject).toHaveBeenCalledWith(
            expect.objectContaining({
              secretKey: "sk-new",
              config: { useResponsesApi: true },
            }),
          ),
        );
      });
    });
  });
});
