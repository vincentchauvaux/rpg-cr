import Link from "next/link";
import { withBasePath } from "@/lib/config";
import { getLegalIdentity } from "@/lib/legal";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";

export const metadata = {
  title: "Mentions légales — RPG-CR",
};

export default function MentionsLegalesPage() {
  const legal = getLegalIdentity();
  return (
    <main className="layout legal-page">
      <p>
        <Link href={withBasePath("/")}>← Accueil</Link>
      </p>
      <h1>Mentions légales</h1>
      <p className="muted">Conformément à la LCEN (loi n° 2004-575).</p>

      <section>
        <h2>Éditeur du site</h2>
        <p>
          <strong>{legal.siteName}</strong>
          <br />
          {legal.publisherName}
          <br />
          {legal.publisherAddress}
          <br />
          Statut : {legal.publisherStatus}
          <br />
          Contact :{" "}
          <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
        </p>
        <p className="muted">
          Complétez <code>LEGAL_PUBLISHER_*</code> et{" "}
          <code>LEGAL_CONTACT_EMAIL</code> dans le <code>.env</code> de production
          avant une ouverture publique.
        </p>
      </section>

      <section>
        <h2>Hébergeur</h2>
        <p>
          {legal.hostName}
          <br />
          {legal.hostAddress}
          <br />
          <a href={legal.hostWebsite} rel="noopener noreferrer" target="_blank">
            {legal.hostWebsite}
          </a>
        </p>
      </section>

      <section>
        <h2>Directeur de la publication</h2>
        <p>{legal.publisherName}</p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          L&apos;interface, le code et les éléments graphiques de {legal.siteName}{" "}
          sont protégés. Les récits et fiches générés dans un salon appartiennent
          aux participants dans les conditions des{" "}
          <Link href={withBasePath("/cgu/")}>CGU</Link>.
        </p>
      </section>

      <SiteLegalFooter />
    </main>
  );
}
