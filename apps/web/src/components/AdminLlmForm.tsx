"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LlmCatalogEntry, LlmRoomConfig } from "@rpg-cr/shared";
import {
  isEmbeddingModelId,
  isLocalLlmProvider,
  isLikelyWrongModelIdForProvider,
  isUnsuitableMjModelId,
  normalizeLmStudioV1BaseUrl,
  defaultModelForLocalProvider,
  catalogModelsForRole,
  defaultNarrationModelId,
  defaultToolModelId,
  usesServerOnlyApiKey,
} from "@rpg-cr/shared";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SettingsToggle } from "@/components/SettingsToggle";
import {
  fieldClass,
  isNonEmpty,
  isOptionalUrl,
  type FieldState,
} from "@/lib/validation";
import { formatLlmTestError } from "@/lib/llm-errors";
import { listLmStudioModels } from "@/lib/api";

interface Props {
  catalog: LlmCatalogEntry[];
  llmForm: LlmRoomConfig;
  setLlmForm: React.Dispatch<React.SetStateAction<LlmRoomConfig>>;
  apiKey: string;
  setApiKey: (v: string) => void;
  onSave: (config: LlmRoomConfig) => Promise<void>;
  onTest: () => Promise<void>;
  initialCollapsed?: boolean;
  /** Déjà en base (ex. reprise salon) — active le test sans ré-enregistrer */
  configPersisted?: boolean;
  /** Replier après enregistrement (désactivé pendant l'onboarding hôte) */
  collapseOnSave?: boolean;
}

function modelValid(form: LlmRoomConfig): boolean {
  if (isLocalLlmProvider(form.providerId)) return isNonEmpty(form.modelId);
  return isNonEmpty(form.modelId);
}

function apiKeyValid(key: string): boolean {
  const v = key.trim();
  if (!v) return true;
  return v.length >= 8;
}

export function AdminLlmForm({
  catalog,
  llmForm,
  setLlmForm,
  apiKey,
  setApiKey,
  onSave,
  onTest,
  initialCollapsed = false,
  configPersisted = false,
  collapseOnSave = true,
}: Props) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed && configPersisted);
  const [saved, setSaved] = useState(initialCollapsed || configPersisted);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    | { state: "idle" }
    | { state: "ok"; detail?: string }
    | { state: "error"; detail: string }
    | { state: "running" }
  >({ state: "idle" });
  const [lmChatModels, setLmChatModels] = useState<string[]>([]);
  const [lmModelsLoading, setLmModelsLoading] = useState(false);
  const [lmModelsError, setLmModelsError] = useState<string | null>(null);
  const [lmModelsUrl, setLmModelsUrl] = useState<string | null>(null);
  const [modelAutoFixed, setModelAutoFixed] = useState<string | null>(null);

  const selectedProvider = catalog.find((c) => c.id === llmForm.providerId);
  const isLocalProvider = isLocalLlmProvider(llmForm.providerId);
  const serverOnlyKey = usesServerOnlyApiKey(llmForm.providerId);
  const narrationCatalogModels = catalogModelsForRole(selectedProvider, "narration");
  const toolCatalogModels = catalogModelsForRole(selectedProvider, "tool");
  const currentNarrationModel = selectedProvider?.models.find(
    (m) => m.id && m.id === llmForm.modelId.trim()
  );
  const mjSelectModels =
    currentNarrationModel &&
    !narrationCatalogModels.some((m) => m.id === currentNarrationModel.id)
      ? [...narrationCatalogModels, currentNarrationModel]
      : narrationCatalogModels.length
        ? narrationCatalogModels
        : (selectedProvider?.models ?? []).filter((m) => m.id);
  const localBackendLabel =
    llmForm.providerId === "ollama" ? "Ollama" : "LM Studio";
  const modelIsEmbedding =
    isLocalProvider && isEmbeddingModelId(llmForm.modelId);
  const modelIsUnsuitableMj =
    isLocalProvider && isUnsuitableMjModelId(llmForm.modelId);
  const modelLikelyWrongFormat =
    isLocalProvider &&
    isLikelyWrongModelIdForProvider(llmForm.providerId, llmForm.modelId);
  const modelInLmStudioList =
    lmChatModels.length > 0 && lmChatModels.includes(llmForm.modelId.trim());
  const modelNotInRemoteList =
    lmChatModels.length > 0 && !modelInLmStudioList;
  const lmSelectValue =
    lmChatModels.includes(llmForm.modelId.trim()) ? llmForm.modelId.trim() : "";

  const modelState: FieldState =
    modelValid(llmForm) &&
    !modelIsEmbedding &&
    !modelIsUnsuitableMj &&
    !modelLikelyWrongFormat &&
    !modelNotInRemoteList
      ? "valid"
      : "invalid";
  const baseUrlState: FieldState = isOptionalUrl(llmForm.baseUrl ?? "")
    ? "valid"
    : "invalid";
  const apiKeyState: FieldState = apiKeyValid(apiKey) ? "valid" : "invalid";

  const show = (key: string) => submitted || Boolean(touched[key]);

  const allValid =
    modelState === "valid" &&
    baseUrlState === "valid" &&
    apiKeyState === "valid";

  function resolvedLmBaseUrl(): string {
    return normalizeLmStudioV1BaseUrl(
      llmForm.baseUrl?.trim() || selectedProvider?.defaultBaseUrl
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!allValid) return;

    setSaving(true);
    setSaveError(null);
    try {
      const normalizedBase = isLocalProvider
          ? resolvedLmBaseUrl()
          : llmForm.baseUrl?.trim() || selectedProvider?.defaultBaseUrl || undefined;
      const toolId = isLocalProvider
        ? undefined
        : (llmForm.toolModelId?.trim() || defaultToolModelId(selectedProvider) || undefined);
      const config: LlmRoomConfig = {
        ...llmForm,
        modelId: llmForm.modelId.trim(),
        toolModelId: toolId,
        baseUrl: normalizedBase,
      };
      await onSave(config);
      setLlmForm((f) => ({ ...f, baseUrl: normalizedBase }));
      setSaved(true);
      if (collapseOnSave) setCollapsed(true);
      setSubmitted(false);
      setTouched({});
      setTestStatus({ state: "idle" });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  function touch(key: string) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  async function handleListLmModels() {
    setLmModelsLoading(true);
    setLmModelsError(null);
    setModelAutoFixed(null);
    try {
      const baseUrl = resolvedLmBaseUrl();
      const result = await listLmStudioModels(baseUrl);
      const chatModels = result.chatModels;
      setLmChatModels(chatModels);
      setLmModelsUrl(result.modelsUrl);
      if (result.resolvedBaseUrl !== llmForm.baseUrl?.trim()) {
        setLlmForm((f) => ({ ...f, baseUrl: result.resolvedBaseUrl }));
      }
      if (chatModels.length === 0) {
        setLmModelsError(
          result.embeddingModels.length
            ? `Seuls des modèles embedding détectés via ${result.modelsUrl} — chargez un modèle chat/instruct.`
            : `Aucun modèle chat via ${result.modelsUrl}`
        );
        return;
      }

      const current = llmForm.modelId.trim();
      if (!chatModels.includes(current)) {
        const next = chatModels[0];
        setLlmForm((f) => ({ ...f, modelId: next }));
        setSaved(false);
        setTestStatus({ state: "idle" });
        setModelAutoFixed(
          `Id corrigé automatiquement : « ${current || "(vide)"} » → « ${next} ». ` +
            "Cliquez **Enregistrer la config MJ** puis **Tester la connexion**."
        );
      }
    } catch (e) {
      setLmModelsError(e instanceof Error ? e.message : "Erreur liste modèles");
      setLmChatModels([]);
      setLmModelsUrl(null);
    } finally {
      setLmModelsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLocalProvider) return;
    void handleListLmModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage et changement de provider local
  }, [isLocalProvider, llmForm.providerId]);

  return (
    <CollapsibleSection
      title="Connexion MJ (LLM)"
      validated={saved}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed(false)}
    >
      <form onSubmit={handleSubmit} className="admin-form" noValidate>
        <div className="field-block">
          <label htmlFor="llm-provider">Fournisseur</label>
          <select
            id="llm-provider"
            className={fieldClass("valid", show("provider"))}
            value={llmForm.providerId}
            onBlur={() => touch("provider")}
            onChange={(e) => {
              const id = e.target.value;
              const entry = catalog.find((c) => c.id === id);
              const isLocal = isLocalLlmProvider(id);
              const wasLocal = isLocalLlmProvider(llmForm.providerId);
              let nextModelId = llmForm.modelId;
              let nextToolId: string | undefined = llmForm.toolModelId;
              if (isLocal && (!wasLocal || llmForm.providerId !== id)) {
                nextModelId = defaultModelForLocalProvider(id);
                nextToolId = undefined;
              } else if (!isLocal) {
                nextModelId = defaultNarrationModelId(entry) || llmForm.modelId;
                nextToolId = defaultToolModelId(entry) || undefined;
              }
              setLlmForm((f) => ({
                ...f,
                providerId: id,
                modelId: nextModelId,
                toolModelId: nextToolId,
                baseUrl: entry?.defaultBaseUrl ?? f.baseUrl,
                useFallbackLmStudio:
                  id === "openrouter"
                    ? false
                    : usesServerOnlyApiKey(id)
                      ? true
                      : f.useFallbackLmStudio,
              }));
              touch("provider");
            }}
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block">
          <label htmlFor="llm-model">
            {isLocalProvider
              ? `Identifiant modèle (${localBackendLabel})`
              : "Modèle"}
          </label>
          {isLocalProvider ? (
            <>
              <input
                id="llm-model"
                className={fieldClass(modelState, show("model"))}
                value={llmForm.modelId}
                onBlur={() => touch("model")}
                onChange={(e) => {
                  setLlmForm((f) => ({ ...f, modelId: e.target.value }));
                  touch("model");
                }}
                placeholder={
                  llmForm.providerId === "ollama"
                    ? "qwen2.5:7b-instruct"
                    : "google/gemma-4-e2b"
                }
                spellCheck={false}
                list={lmChatModels.length ? "lm-chat-models" : undefined}
              />
              {lmChatModels.length > 0 && (
                <datalist id="lm-chat-models">
                  {lmChatModels.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              )}
              <p className="llm-hint muted" style={{ marginTop: "0.35rem" }}>
                Utilisez un modèle <strong>chat/instruct</strong> (contexte 8k+), pas un modèle{" "}
                <strong>embedding</strong> ni un modèle <strong>vision (VL)</strong>.
              </p>
              {modelLikelyWrongFormat && (
                <p className="form-error" role="alert">
                  Format LM Studio détecté (<code>{llmForm.modelId.trim()}</code>) — sur Ollama
                  utilisez un id du type <code>qwen2.5:7b-instruct</code>. Cliquez{" "}
                  <strong>Lister modèles Ollama</strong> pour corriger automatiquement.
                </p>
              )}
              {modelNotInRemoteList && !modelLikelyWrongFormat && (
                <p className="form-error" role="alert">
                  L&apos;id <code>{llmForm.modelId.trim()}</code> n&apos;est pas installé sur{" "}
                  {localBackendLabel}. Choisissez dans la liste ci-dessous.
                </p>
              )}
              {modelIsEmbedding && (
                <p className="form-error" role="alert">
                  Ce modèle est un modèle d&apos;embeddings — choisissez un modèle de
                  conversation (qwen, gemma, llama, hermes…).
                </p>
              )}
              {modelIsUnsuitableMj && (
                <p className="form-error" role="alert">
                  Ce modèle est un modèle <strong>vision (VL)</strong> — il plante souvent en MJ
                  texte. Choisissez un instruct 7B+ (ex.{" "}
                  <code>qwen2.5-7b-instruct</code>).
                </p>
              )}
              {modelInLmStudioList && (
                <p className="llm-hint muted" style={{ borderLeftColor: "var(--valid)" }}>
                  ✓ Modèle configuré présent dans {localBackendLabel} :{" "}
                  <code>{llmForm.modelId.trim()}</code>
                </p>
              )}
              <div
                className="lm-models-toolbar"
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.35rem" }}
              >
                <button
                  type="button"
                  disabled={lmModelsLoading}
                  onClick={handleListLmModels}
                >
                  {lmModelsLoading ? "Chargement…" : `Lister modèles ${localBackendLabel} (chat)`}
                </button>
                {lmChatModels.length > 0 && (
                  <select
                    aria-label="Choisir un modèle chat"
                    className="lm-model-picker"
                    value={lmSelectValue}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) setLlmForm((f) => ({ ...f, modelId: id }));
                    }}
                  >
                    <option value="">— Choisir dans la liste —</option>
                    {lmChatModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                        {id === llmForm.modelId.trim() ? " ✓" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {lmModelsUrl && lmChatModels.length > 0 && (
                <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  {lmChatModels.length} modèle(s) chat via{" "}
                  <code>{lmModelsUrl}</code>
                </p>
              )}
              {modelAutoFixed && (
                <p
                  className="llm-hint muted"
                  style={{ borderLeftColor: "var(--valid)", marginTop: "0.35rem" }}
                  role="status"
                >
                  ✓ {modelAutoFixed}
                </p>
              )}
              {lmModelsError && (
                <p className="form-error" style={{ marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>
                  {lmModelsError}
                </p>
              )}
            </>
          ) : (
            <select
              id="llm-model"
              className={fieldClass(modelState, show("model"))}
              value={llmForm.modelId}
              onBlur={() => touch("model")}
              onChange={(e) => {
                setLlmForm((f) => ({ ...f, modelId: e.target.value }));
                touch("model");
              }}
            >
              {mjSelectModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {!isLocalProvider && toolCatalogModels.length > 0 && (
          <div className="field-block">
            <label htmlFor="llm-tool-model">Modèle outils (extraction, traduction)</label>
            <select
              id="llm-tool-model"
              className={fieldClass("valid", show("toolModel"))}
              value={
                llmForm.toolModelId?.trim() ||
                defaultToolModelId(selectedProvider)
              }
              onBlur={() => touch("toolModel")}
              onChange={(e) => {
                setLlmForm((f) => ({ ...f, toolModelId: e.target.value || undefined }));
                touch("toolModel");
              }}
            >
              {toolCatalogModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="llm-hint muted" style={{ marginTop: "0.35rem" }}>
              Température basse, JSON pour les extraits. Le récit MJ utilise le modèle ci-dessus.
            </p>
          </div>
        )}

        {isLocalProvider && (
          <p className="llm-hint muted">
            Outils (extraction, traduction) : <strong>même modèle</strong>, profil déterministe
            (température basse). Un second modèle n&apos;est pas chargé — RAM VPS préservée.
            {llmForm.providerId === "ollama" ? (
              <>
                {" "}
                Si la machine a 16&nbsp;Go+ : <code>qwen3:8b</code> ou{" "}
                <code>qwen3:14b</code> suivent mieux les consignes que{" "}
                <code>qwen2.5:7b-instruct</code>.
              </>
            ) : null}
          </p>
        )}

        <div className="field-block">
          <label htmlFor="llm-base-url">URL API (optionnel)</label>
          <input
            id="llm-base-url"
            className={fieldClass(baseUrlState, show("baseUrl"))}
            value={llmForm.baseUrl ?? ""}
            onBlur={() => touch("baseUrl")}
            onChange={(e) => {
              setLlmForm((f) => ({
                ...f,
                baseUrl: e.target.value || undefined,
              }));
              touch("baseUrl");
            }}
            placeholder={selectedProvider?.defaultBaseUrl ?? ""}
          />
          {isLocalProvider && (
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
              Doit se terminer par <code>/v1</code> — normalisé auto si omis (ex.{" "}
              <code>{resolvedLmBaseUrl()}</code>).
            </p>
          )}
        </div>

        {serverOnlyKey ? (
          <p className="llm-hint muted">
            Clé lue uniquement sur le serveur (
            <code>
              {llmForm.providerId === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"}
            </code>
            ). Elle n&apos;est jamais envoyée au navigateur ni stockée en base.
          </p>
        ) : (
          <div className="field-block">
            <label htmlFor="llm-api-key">
              Clé API (session, non stockée)
            </label>
            <input
              id="llm-api-key"
              type="password"
              autoComplete="new-password"
              className={fieldClass(apiKeyState, show("apiKey"))}
              value={apiKey}
              onBlur={() => touch("apiKey")}
              onChange={(e) => {
                setApiKey(e.target.value);
                touch("apiKey");
              }}
              placeholder={
                llmForm.providerId === "openrouter"
                  ? "sk-or-… (ou OPENROUTER_API_KEY dans .env)"
                  : "sk-… (optionnel — clé serveur OPENAI_API_KEY sinon)"
              }
            />
            {llmForm.providerId === "openrouter" && (
              <p className="llm-hint muted" style={{ marginTop: "0.35rem" }}>
                Ne jamais coller la clé dans le chat. Session = ce champ (non enregistré en base).
                Prod = <code>OPENROUTER_API_KEY</code> dans <code>.env</code> sur le VPS.
              </p>
            )}
          </div>
        )}

        <SettingsToggle
          id="llm-auto-extract-facts"
          checked={llmForm.autoExtractFacts !== false}
          onChange={(checked) =>
            setLlmForm((f) => ({ ...f, autoExtractFacts: checked }))
          }
          label="Extraire automatiquement les faits canon après chaque réponse MJ"
        />

        <SettingsToggle
          id="llm-fallback-lmstudio"
          checked={llmForm.useFallbackLmStudio}
          onChange={(checked) =>
            setLlmForm((f) => ({ ...f, useFallbackLmStudio: checked }))
          }
          label="Fallback LM Studio si échec"
          hint="Chaîne : provider principal → AI_FALLBACK_PROVIDER (ex. Gemini) → LM Studio / Ollama local. Désactivé si le provider est déjà local."
        />

        {submitted && !allValid && (
          <p className="form-error">Corrigez les champs en rouge avant d&apos;enregistrer.</p>
        )}

        <button
          type="submit"
          className="primary"
          style={{ marginTop: "0.5rem" }}
          disabled={saving}
        >
          {saving ? "Enregistrement…" : "Enregistrer la config MJ"}
        </button>

        {saveError && <p className="form-error">{saveError}</p>}

        <p className="llm-hint muted">
          Enregistre en base sans tester la connexion — le MJ répondra automatiquement
          aux messages Dire/Action une fois configuré.
        </p>
        {isLocalProvider && (
          <p className="llm-hint muted">
            {localBackendLabel} : serveur sur cette machine (
            <code>{resolvedLmBaseUrl()}</code>
            ), modèle chargé = identifiant ci-dessus
            {llmForm.providerId === "ollama" ? (
              <>
                {" "}
                (ex. <code>qwen2.5:7b-instruct</code> — <code>ollama pull</code> si absent.
                Optionnel : <code>qwen3:8b</code> / <code>qwen3:14b</code> si RAM suffisante).
              </>
            ) : (
              <>
                {" "}
                (ex. <code>google/gemma-4-e2b</code>). Après changement, attendez{" "}
                <strong>READY</strong> (JIT 30–90 s).
              </>
            )}
          </p>
        )}

        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={async () => {
              setTestStatus({ state: "running" });
              try {
                await onTest();
                setTestStatus({ state: "ok", detail: "Connexion OK." });
              } catch (e) {
                const raw = e instanceof Error ? e.message : "Test échoué";
                setTestStatus({
                  state: "error",
                  detail: formatLlmTestError(raw, llmForm.providerId),
                });
              }
            }}
            disabled={!saved || saving}
            title={
              saved
                ? "Effectue un appel léger vers le provider (sans écrire dans le chat)."
                : "Enregistrez d'abord la config."
            }
          >
            {testStatus.state === "running" ? "Test en cours…" : "Tester la connexion"}
          </button>
          {testStatus.state === "ok" && (
            <p className="llm-hint muted" style={{ borderLeftColor: "var(--valid)" }}>
              ✓ {testStatus.detail}
            </p>
          )}
          {testStatus.state === "error" && (
            <p
              className="llm-hint muted llm-test-error"
              style={{ borderLeftColor: "var(--invalid)", whiteSpace: "pre-wrap" }}
            >
              ✕ {testStatus.detail}
            </p>
          )}
        </div>
      </form>
    </CollapsibleSection>
  );
}
