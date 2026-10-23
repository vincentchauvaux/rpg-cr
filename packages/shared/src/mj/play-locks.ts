/** Verrous extraits du fil : prix, offre, objets déjà pris. Sans LLM. */

export type PlayLockSource = { kind: string; content: string };

export type PlayLocks = {
  price?: string;
  offer?: string;
  taken: string[];
};

const OR_WORDS: Record<string, string> = {
  dix: "10",
  quinze: "15",
  vingt: "20",
  trente: "30",
  quarante: "40",
  cinquante: "50",
};

const PRICE_RE =
  /(?:^|[^\p{L}])(\d+|dix|quinze|vingt|trente|quarante|cinquante)\s+pi[eè]ces?\s+d['’]?or\b/giu;

const OFFER_RE =
  /(?:je te donne|je vous donne|je te propose|ingr[eé]dients?(?:\s+(?:que|propos))?[^.«]{0,40})\s+(?:les |le |la |l['’])?([^.]{12,160})/giu;

const TAKEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /[eé]p[eé]e de poing/iu, label: "épée de poing" },
  {
    re: /(?:prends?|prenez|pris|prenez|glisses?|range|fourreau|r[eé]cup[eé]r).{0,40}parchemin|parchemin.{0,40}(?:prends?|prenez|pris|glisses?|range)/iu,
    label: "parchemin",
  },
];

function normalizePrice(raw: string): string {
  const key = raw.toLowerCase();
  const n = OR_WORDS[key] ?? raw;
  return `${n} pièces d'or`;
}

function cleanOffer(raw: string): string {
  return raw
    .replace(/^(?:les |le |la |l['’])/iu, "")
    .replace(/\s+/g, " ")
    .replace(/[«»"]/g, "")
    .trim();
}

/** Premier prix / première offre gagne : ce qui a été dit reste vrai. */
export function extractPlayLocks(messages: PlayLockSource[]): PlayLocks {
  const locks: PlayLocks = { taken: [] };
  const window = messages.slice(-16);

  for (const m of window) {
    const text = m.content ?? "";
    if (!locks.price) {
      const price = PRICE_RE.exec(text);
      PRICE_RE.lastIndex = 0;
      if (price?.[1]) locks.price = normalizePrice(price[1]);
    }
    if (!locks.offer && (m.kind === "mj" || m.kind === "chat")) {
      const offer = OFFER_RE.exec(text);
      OFFER_RE.lastIndex = 0;
      const cleaned = offer?.[1] ? cleanOffer(offer[1]) : "";
      if (cleaned && /et |, /.test(cleaned)) locks.offer = cleaned;
    }
    for (const pat of TAKEN_PATTERNS) {
      if (pat.re.test(text) && !locks.taken.includes(pat.label)) {
        locks.taken.push(pat.label);
      }
    }
  }

  return locks;
}

export function formatPlayLocksForMj(locks: PlayLocks): string {
  const lines: string[] = [];
  if (locks.price) lines.push(`- Prix demandé : ${locks.price}`);
  if (locks.offer) lines.push(`- Offre en cours : ${locks.offer}`);
  if (locks.taken.length) lines.push(`- Déjà pris : ${locks.taken.join(" ; ")}`);
  if (!lines.length) return "";
  return (
    "### Verrous (ne pas changer — répète mot pour mot)\n" +
    lines.join("\n") +
    "\nInterdit d'inventer un autre prix, d'autres ingrédients ou de faire disparaître un objet déjà pris."
  );
}
