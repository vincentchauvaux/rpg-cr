"use client";

import { useState } from "react";
import type { LlmCatalogEntry, LlmRoomConfig } from "@rpg-cr/shared";
import { AdminLlmForm } from "@/components/AdminLlmForm";
import { LmStudioTunnelBanner } from "@/components/LmStudioTunnelBanner";
import { isVpsLmStudioHostMode } from "@/lib/lmstudio-tunnel";
import { useAutoHostTunnel } from "@/hooks/use-auto-host-tunnel";

interface Props {
  roomCode: string;
  catalog: LlmCatalogEntry[];
  llmForm: LlmRoomConfig;
  setLlmForm: React.Dispatch<React.SetStateAction<LlmRoomConfig>>;
  apiKey: string;
  setApiKey: (v: string) => void;
  hasLlmConfig: boolean;
  onSave: (config: LlmRoomConfig) => Promise<void>;
  onTest: () => Promise<void>;
  onContinue: () => void;
}

export function HostSetupWizard({
  roomCode,
  catalog,
  llmForm,
  setLlmForm,
  apiKey,
  setApiKey,
  hasLlmConfig,
  onSave,
  onTest,
  onContinue,
}: Props) {
  const [llmTested, setLlmTested] = useState(false);

  useAutoHostTunnel(isVpsLmStudioHostMode());

  async function handleTest() {
    if (!hasLlmConfig) return;
    try {
      await onTest();
      setLlmTested(true);
    } catch (e) {
      setLlmTested(false);
      throw e;
    }
  }

  const canContinue = hasLlmConfig && llmTested;
  const showTunnelBanner = isVpsLmStudioHostMode();

  return (
    <div
      className="char-wizard-overlay char-wizard-overlay--section host-setup-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-setup-title"
    >
      <div className="char-wizard panel host-setup-wizard">
        <p className="host-setup-step muted">Étape 1 sur 2 — Administration</p>
        <h2 id="host-setup-title">Configurer le MJ (LLM)</h2>
        <p className="muted">
          Salon <strong>{roomCode}</strong> — avant de créer votre personnage,
          connectez Ollama (VPS), LM Studio ou un fournisseur cloud. Les autres
          joueurs utiliseront cette configuration.
        </p>

        {showTunnelBanner && <LmStudioTunnelBanner refreshKey={llmTested ? 1 : 0} />}

        <AdminLlmForm
          catalog={catalog}
          llmForm={llmForm}
          setLlmForm={setLlmForm}
          apiKey={apiKey}
          setApiKey={setApiKey}
          configPersisted={hasLlmConfig}
          collapseOnSave={false}
          onSave={async (config) => {
            await onSave(config);
            setLlmTested(false);
          }}
          onTest={handleTest}
          initialCollapsed={false}
        />

        <div className="char-wizard-actions host-setup-actions">
          <button
            type="button"
            className="primary"
            disabled={!canContinue}
            title={
              canContinue
                ? "Passer à la création du personnage"
                : "Testez la connexion MJ avec succès avant de continuer"
            }
            onClick={onContinue}
          >
            Continuer — créer mon personnage
          </button>
        </div>
        {!hasLlmConfig && (
          <p className="host-setup-hint muted">
            Enregistrez d&apos;abord la configuration MJ ci-dessus.
          </p>
        )}
        {hasLlmConfig && !llmTested && (
          <p className="host-setup-hint muted">
            Configuration enregistrée — cliquez sur <strong>Tester la connexion</strong>{" "}
            dans le formulaire, puis continuez.
          </p>
        )}
        {canContinue && (
          <p className="host-setup-hint muted" style={{ borderLeftColor: "var(--valid)" }}>
            Connexion validée — vous pouvez passer à l&apos;étape 2 (fiche personnage).
          </p>
        )}
      </div>
    </div>
  );
}
