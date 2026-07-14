"use client";

import { useState, type FormEvent } from "react";
import type { LlmCatalogEntry, LlmRoomConfig } from "@rpg-cr/shared";
import {
  isEmbeddingModelId,
  isUnsuitableMjModelId,
  normalizeLmStudioV1BaseUrl,
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
  if (form.providerId === "lmstudio") return isNonEmpty(form.modelId);
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

  const selectedProvider = catalog.find((c) => c.id === llmForm.providerId);
  const modelIsEmbedding =
    llmForm.providerId === "lmstudio" && isEmbeddingModelId(llmForm.modelId);
  const modelIsUnsuitableMj =
    llmForm.providerId === "lmstudio" && isUnsuitableMjModelId(llmForm.modelId);
  const modelInLmStudioList =
    lmChatModels.length > 0 && lmChatModels.includes(llmForm.modelId.trim());
  const lmSelectValue =
    lmChatModels.includes(llmForm.modelId.trim()) ? llmForm.modelId.trim() : "";

  const modelState: FieldState =
    modelValid(llmForm) && !modelIsEmbedding && !modelIsUnsuitableMj
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
      const normalizedBase =
        llmForm.providerId === "lmstudio"
          ? resolvedLmBaseUrl()
          : llmForm.baseUrl?.trim() || selectedProvider?.defaultBaseUrl || undefined;
      const config: LlmRoomConfig = {
        ...llmForm,
        modelId: llmForm.modelId.trim(),
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
    try {
      const baseUrl = resolvedLmBaseUrl();
      const result = await listLmStudioModels(baseUrl);
      setLmChatModels(result.chatModels);
      setLmModelsUrl(result.modelsUrl);
      if (result.resolvedBaseUrl !== llmForm.baseUrl?.trim()) {
        setLlmForm((f) => ({ ...f, baseUrl: result.resolvedBaseUrl }));
      }
      if (result.chatModels.length === 0) {
        setLmModelsError(
          result.embeddingModels.length
            ? `Seuls des modèles embedding détectés via ${result.modelsUrl} — chargez un modèle chat/instruct.`
            : `Aucun modèle chat via ${result.modelsUrl}`
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
              const isLm = id === "lmstudio";
              setLlmForm((f) => ({
                ...f,
                providerId: id,
                modelId: isLm ? f.modelId : (entry?.models[0]?.id ?? f.modelId),
                baseUrl: entry?.defaultBaseUrl ?? f.baseUrl,
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
            {llmForm.providerId === "lmstudio"
              ? "Identifiant modèle (copier depuis LM Studio)"
              : "Modèle"}
          </label>
          {llmForm.providerId === "lmstudio" ? (
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
                placeholder="google/gemma-4-e2b"
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
                  ✓ Modèle configuré présent dans LM Studio :{" "}
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
                  {lmModelsLoading ? "Chargement…" : "Lister modèles LM Studio (chat)"}
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
              {selectedProvider?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>

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
          {llmForm.providerId === "lmstudio" && (
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
              Doit se terminer par <code>/v1</code> — normalisé auto si omis (ex.{" "}
              <code>{resolvedLmBaseUrl()}</code>).
            </p>
          )}
        </div>

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
            placeholder="sk-… (optionnel — clé serveur OPENAI_API_KEY sinon)"
          />
        </div>

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
          hint="Uniquement si fournisseur OpenAI/Anthropic — pas si LM Studio est déjà sélectionné."
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
        {llmForm.providerId === "lmstudio" && (
          <p className="llm-hint muted">
            LM Studio : serveur sur cette machine (<code>{resolvedLmBaseUrl()}</code>
            ), modèle READY = identifiant ci-dessus (ex. <code>google/gemma-4-e2b</code>).
            Après changement de modèle, attendez le statut <strong>READY</strong> (JIT 30–90 s).
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
                  detail: formatLlmTestError(raw),
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
