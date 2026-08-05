/** Identité éditeur / hébergeur — surcharger via variables d'environnement en prod. */

export type LegalIdentity = {
  siteName: string;
  publisherName: string;
  publisherAddress: string;
  publisherStatus: string;
  contactEmail: string;
  hostName: string;
  hostAddress: string;
  hostWebsite: string;
  publicUrl: string;
};

export function getLegalIdentity(): LegalIdentity {
  return {
    siteName: process.env.LEGAL_SITE_NAME?.trim() || "RPG-CR",
    publisherName:
      process.env.LEGAL_PUBLISHER_NAME?.trim() ||
      "[À compléter — nom / raison sociale de l'éditeur]",
    publisherAddress:
      process.env.LEGAL_PUBLISHER_ADDRESS?.trim() ||
      "[À compléter — adresse postale de l'éditeur]",
    publisherStatus:
      process.env.LEGAL_PUBLISHER_STATUS?.trim() ||
      "Personne physique / structure à préciser",
    contactEmail:
      process.env.LEGAL_CONTACT_EMAIL?.trim() ||
      "contact@example.com",
    hostName: process.env.LEGAL_HOST_NAME?.trim() || "OVH SAS",
    hostAddress:
      process.env.LEGAL_HOST_ADDRESS?.trim() ||
      "2 rue Kellermann, 59100 Roubaix, France",
    hostWebsite:
      process.env.LEGAL_HOST_WEBSITE?.trim() || "https://www.ovhcloud.com",
    publicUrl:
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "https://vps-e09ed6db.vps.ovh.net/rpg-cr/",
  };
}
