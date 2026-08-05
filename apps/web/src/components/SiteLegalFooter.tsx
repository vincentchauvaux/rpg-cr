import Link from "next/link";
import { withBasePath } from "@/lib/config";

const LINKS = [
  { href: "/mentions-legales/", label: "Mentions légales" },
  { href: "/confidentialite/", label: "Confidentialité" },
  { href: "/cgu/", label: "CGU" },
] as const;

export function SiteLegalFooter() {
  return (
    <footer className="site-legal-footer" role="contentinfo">
      <nav aria-label="Informations légales">
        {LINKS.map((l) => (
          <Link key={l.href} href={withBasePath(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="muted site-legal-footer-note">
        Salons JDR guidés par IA — cookies de session strictement nécessaires
        (compte Google). Voir la politique de confidentialité.
      </p>
    </footer>
  );
}
