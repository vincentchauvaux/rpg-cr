import Link from "next/link";
import { withBasePath } from "@/lib/config";
import { getLegalIdentity } from "@/lib/legal";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";

export const metadata = {
  title: "Politique de confidentialité — RPG-CR",
};

export default function ConfidentialitePage() {
  const legal = getLegalIdentity();
  return (
    <main className="layout legal-page">
      <p>
        <Link href={withBasePath("/")}>← Accueil</Link>
      </p>
      <h1>Politique de confidentialité</h1>
      <p className="muted">
        Dernière mise à jour : août 2026 — conformité RGPD (UE) / Loi Informatique
        et Libertés.
      </p>

      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          {legal.publisherName}
          <br />
          {legal.publisherAddress}
          <br />
          Contact / demandes RGPD :{" "}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
        </p>
      </section>

      <section>
        <h2>2. Données collectées</h2>
        <ul>
          <li>
            <strong>Compte Google (optionnel)</strong> : identifiant Google,
            nom d&apos;affichage, adresse e-mail, photo de profil — via Auth.js /
            OAuth Google.
          </li>
          <li>
            <strong>Salon de jeu</strong> : nom de personnage, messages chat /
            actions, fiche personnage, métadonnées de scène, exports Markdown
            de campagne.
          </li>
          <li>
            <strong>Technique</strong> : logs serveur (IP, user-agent) via Nginx /
            Fastify ; cookies de session Auth.js ; stockage local navigateur
            (session salon, préférences UI).
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Finalités et bases légales</h2>
        <ul>
          <li>
            Fourniture du service de salon JDR (exécution du contrat / intérêt
            légitime pour l&apos;usage anonyme par code salon).
          </li>
          <li>
            Authentification Google et synchronisation des « graines »
            (consentement / exécution du contrat compte).
          </li>
          <li>
            Génération narrative par IA (exécution du service) — le contenu
            peut être transmis au fournisseur LLM configuré (Ollama local,
            LM Studio, ou API cloud saisie par l&apos;hôte).
          </li>
          <li>Sécurité, prévention des abus (intérêt légitime).</li>
        </ul>
      </section>

      <section>
        <h2>4. Destinataires et sous-traitants</h2>
        <ul>
          <li>
            <strong>Hébergeur</strong> : {legal.hostName} ({legal.hostAddress}).
          </li>
          <li>
            <strong>Google</strong> : authentification OAuth (politique Google).
          </li>
          <li>
            <strong>LLM</strong> : selon la config du salon — modèle local sur le
            VPS (Ollama) ou service choisi par l&apos;hôte. Les messages et
            extraits de fiche peuvent être envoyés au modèle pour générer le
            récit.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Durée de conservation</h2>
        <p>
          Les données de salon restent tant que la campagne n&apos;est pas
          supprimée côté serveur. Les comptes Google liés : jusqu&apos;à demande
          de suppression. Les logs techniques : durée raisonnable d&apos;exploitation
          (rotation standard de l&apos;hébergeur).
        </p>
      </section>

      <section>
        <h2>6. Cookies</h2>
        <p>
          Cookies <strong>strictement nécessaires</strong> à la session Auth.js
          (connexion Google). Pas de cookies publicitaires ni d&apos;analytics
          tiers. Le stockage local (localStorage) mémorise la session de table
          et des préférences — ce n&apos;est pas un cookie HTTP.
        </p>
      </section>

      <section>
        <h2>7. Vos droits</h2>
        <p>
          Accès, rectification, effacement, limitation, opposition, portabilité
          — écrivez à{" "}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
          Vous pouvez aussi introduire une réclamation auprès de la{" "}
          <a
            href="https://www.cnil.fr"
            rel="noopener noreferrer"
            target="_blank"
          >
            CNIL
          </a>
          .
        </p>
        <p>
          Pour supprimer un compte lié : demandez-le à l&apos;adresse ci-dessus
          (procédure manuelle MVP). Vous pouvez quitter un salon via
          « Sauvegarder et quitter » ; l&apos;oubli d&apos;une graine sur
          l&apos;appareil n&apos;efface pas les données serveur.
        </p>
      </section>

      <section>
        <h2>8. Transferts hors UE</h2>
        <p>
          Google OAuth peut impliquer un traitement hors UE encadré par les
          clauses contractuelles types / cadre applicable. Un LLM cloud
          (OpenAI, etc.) choisi par l&apos;hôte peut également transférer du
          contenu hors UE — l&apos;hôte en est informé via la configuration
          god mode.
        </p>
      </section>

      <SiteLegalFooter />
    </main>
  );
}
