import Link from "next/link";
import { withBasePath } from "@/lib/config";
import { getLegalIdentity } from "@/lib/legal";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";

export const metadata = {
  title: "Conditions générales d'utilisation — RPG-CR",
};

export default function CguPage() {
  const legal = getLegalIdentity();
  return (
    <main className="layout legal-page">
      <p>
        <Link href={withBasePath("/")}>← Accueil</Link>
      </p>
      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="muted">Dernière mise à jour : août 2026</p>

      <section>
        <h2>1. Objet</h2>
        <p>
          {legal.siteName} propose des salons de jeu de rôle en ligne assistés
          par un maître du jeu (MJ) généré par intelligence artificielle. L&apos;accès
          au service vaut acceptation des présentes CGU.
        </p>
      </section>

      <section>
        <h2>2. Accès et comptes</h2>
        <ul>
          <li>
            Usage possible <strong>sans compte</strong> via un code salon (6
            caractères) partagé par l&apos;hôte.
          </li>
          <li>
            Compte Google optionnel pour synchroniser vos campagnes (« graines »)
            entre appareils.
          </li>
          <li>
            Vous êtes responsable de la confidentialité du code salon et de
            votre session locale (navigateur).
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Âge minimum</h2>
        <p>
          Le service s&apos;adresse aux personnes majeures ou mineurs avec
          autorisation parentale. Les contenus générés par IA peuvent être
          inappropriés pour un jeune public — l&apos;hôte reste responsable du
          cadre de sa table.
        </p>
      </section>

      <section>
        <h2>4. Contenu et IA</h2>
        <ul>
          <li>
            Les récits, PNJ et décisions du MJ sont <strong>générés par un
            modèle de langage</strong> — ils peuvent être incorrects, biaisés ou
            incohérents. Ce n&apos;est pas un conseil professionnel.
          </li>
          <li>
            Vous vous engagez à un usage respectueux : pas de harcèlement, de
            contenus illicites, ni d&apos;abus du service (spam, scraping, attaques).
          </li>
          <li>
            Les participants conservent leurs droits sur leurs contributions
            (dialogues, fiches). En publiant dans un salon, vous autorisez les
            autres joueurs du salon et le MJ IA à les traiter pour le déroulement
            de la partie.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Disponibilité et responsabilité</h2>
        <p>
          Le service est fourni « en l&apos;état ». {legal.siteName} ne garantit
          pas une disponibilité continue ni l&apos;absence de perte de données.
          Dans les limites autorisées par la loi, la responsabilité est limitée
          aux dommages directs prouvés, à l&apos;exclusion des pertes
          indirectes.
        </p>
      </section>

      <section>
        <h2>6. Données personnelles</h2>
        <p>
          Le traitement est décrit dans la{" "}
          <Link href={withBasePath("/confidentialite/")}>
            politique de confidentialité
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>7. Modification et contact</h2>
        <p>
          Les CGU peuvent évoluer ; la date en tête de page fait foi. Contact :{" "}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
        </p>
      </section>

      <SiteLegalFooter />
    </main>
  );
}
