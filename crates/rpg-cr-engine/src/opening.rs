use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::mj_prose::{opening_too_many_places, opening_too_ornate};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningSheet {
    pub rank: Option<String>,
    pub servants: Option<String>,
    pub background: Option<String>,
    pub family: Option<String>,
    pub secret: Option<String>,
    pub companion_bond: Option<String>,
    pub notes: Option<String>,
    pub creation_brief: Option<OpeningBrief>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningBrief {
    pub activity: Option<String>,
    pub station: Option<String>,
    pub past: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningQuality {
    pub unplayable: bool,
    pub reasons: Vec<String>,
}

fn strip_opening_comments(text: &str) -> String {
    static RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?s)<!--.*?-->").expect("comments"));
    RE.replace_all(text, "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn escape_regex(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for c in value.chars() {
        if ".+*?^$()[]{}|\\".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

pub fn normalize_person_name(value: &str) -> String {
    static DASHES: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"[\s\-‑–—]+").expect("dashes"));
    DASHES
        .replace_all(value.trim(), " ")
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn names_refer_to_same_person(a: &str, b: &str) -> bool {
    let na = normalize_person_name(a);
    let nb = normalize_person_name(b);
    if na.is_empty() || nb.is_empty() {
        return false;
    }
    if na == nb {
        return true;
    }
    let fa = na.split(' ').next().unwrap_or("");
    let fb = nb.split(' ').next().unwrap_or("");
    if fa.len() >= 4 && fa == fb {
        return true;
    }
    na.starts_with(&format!("{nb} ")) || nb.starts_with(&format!("{na} "))
}

fn host_name_match_pattern(host_name: &str) -> String {
    escape_regex(host_name.trim()).replace(|c: char| " -‑–—".contains(c), r"[\s\-‑–—]+")
}

fn host_name_match_variants(host_name: &str) -> Vec<String> {
    let full = host_name_match_pattern(host_name);
    let first = host_name
        .trim()
        .split(|c: char| " -‑–—".contains(c))
        .find(|p| !p.is_empty());
    if let Some(first) = first {
        if first.len() >= 4 {
            let f = escape_regex(first);
            if f.to_lowercase() != full.to_lowercase() {
                return vec![full, f];
            }
        }
    }
    vec![full]
}

pub fn opening_treats_host_as_npc(content: &str, host_name: &str) -> bool {
    let name = host_name.trim();
    if name.is_empty() {
        return false;
    }
    let t = strip_opening_comments(content);
    for n in host_name_match_variants(name) {
        let follow = Regex::new(&format!(
            r"(?iu)\b(suivre|rejoins?|rejoint|accompagne[rz]?)\s+{n}\b"
        ))
        .ok();
        if follow.is_some_and(|re| re.is_match(&t)) {
            return true;
        }
        let pose = Regex::new(&format!(
            r"(?iu){n}[^.!?]{{0,160}}\b(se tient|se trouve|s'approche|scrute|hoche la tête|se tourne vers vous|vous (regarde|lance)|dit-il|dit‑il|annonce-t-il)"
        ))
        .ok();
        if pose.is_some_and(|re| re.is_match(&t)) {
            return true;
        }
        let team = Regex::new(&format!(
            r"(?iu){n}[^.!?]{{0,100}}\b(a besoin d['']une équipe|vous avez tous|vous êtes arrivés)"
        ))
        .ok();
        if team.is_some_and(|re| re.is_match(&t)) {
            return true;
        }
        let faces = Regex::new(&format!(
            r"(?iu)\b(visages?|yeux|silhouettes?)\b[^.!?]{{0,60}}\bde {n}\b"
        ))
        .ok();
        if faces.is_some_and(|re| re.is_match(&t)) {
            return true;
        }
        let decide = Regex::new(&format!(
            r"(?iu)\b{n}\s+(doit|devra|peut)(?:\s+[\p{{L}}'’-]+){{0,4}}\s+(décider|choisir|agir)\b"
        ))
        .ok();
        if decide.is_some_and(|re| re.is_match(&t)) {
            return true;
        }
    }
    false
}

fn sheet_canon_blob(host_name: &str, sheet: Option<&OpeningSheet>) -> String {
    let Some(sheet) = sheet else {
        return host_name.to_string();
    };
    [
        host_name,
        sheet.rank.as_deref().unwrap_or(""),
        sheet.servants.as_deref().unwrap_or(""),
        sheet.background.as_deref().unwrap_or(""),
        sheet.family.as_deref().unwrap_or(""),
        sheet.companion_bond.as_deref().unwrap_or(""),
        sheet.notes.as_deref().unwrap_or(""),
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}

pub fn opening_invented_named_npc(
    content: &str,
    host_name: &str,
    sheet: Option<&OpeningSheet>,
) -> bool {
    let t = strip_opening_comments(content);
    let canon = normalize_person_name(&sheet_canon_blob(host_name, sheet));
    static TITLED: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?u)\b(?:Sir|Sire|Dame|Lord|Lady|Maître|Maitre|Capitaine)\s+([A-ZÉÈÀÂÎÔÛ][\p{L}'’-]+)")
            .expect("titled")
    });
    static NAMED: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?u)\bnomm(?:é|ée|és|ées)\s+([A-ZÉÈÀÂÎÔÛ][\p{L}'’-]+)")
            .expect("named")
    });
    for re in [&*TITLED, &*NAMED] {
        for cap in re.captures_iter(&t) {
            let given = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if given.is_empty() {
                continue;
            }
            if names_refer_to_same_person(given, host_name) {
                continue;
            }
            if canon.contains(&normalize_person_name(given)) {
                continue;
            }
            return true;
        }
    }
    false
}

pub fn opening_invented_family_secret(content: &str, sheet: Option<&OpeningSheet>) -> bool {
    let t = strip_opening_comments(content);
    static SECRET: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)vérité sur (ton|votre) père|secret (de ta|de votre) famille|destin[ée]? se cache")
            .expect("secret")
    });
    if !SECRET.is_match(&t) {
        return false;
    }
    let known = format!(
        "{} {} {}",
        sheet.and_then(|s| s.secret.as_deref()).unwrap_or(""),
        sheet.and_then(|s| s.family.as_deref()).unwrap_or(""),
        sheet.and_then(|s| s.background.as_deref()).unwrap_or("")
    );
    static KNOWN: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)père|pere|famille|destin").expect("known"));
    !KNOWN.is_match(&known)
}

pub fn opening_looks_like_quest_mcguffin(content: &str) -> bool {
    let t = strip_opening_comments(content);
    let parchment = Regex::new(r"(?i)\b(parchemin|manuscrit|missive|papier griffonn)\b")
        .unwrap()
        .is_match(&t);
    let cryptic = Regex::new(r"(?i)\b(crypt[ée]|message.{0,40}cod[ée]|phare d['’]argent|éclat de la mer|trouvez le)\b")
        .unwrap()
        .is_match(&t);
    let vanish = Regex::new(r"(?i)\b(dispara[iî]t|se fond (dans|parmi)|s['’]évanouit|visage disparaissant|se fond rapidement)\b")
        .unwrap()
        .is_match(&t);
    if parchment && (cryptic || vanish) {
        return true;
    }
    if parchment && vanish && Regex::new(r"(?i)\b(inconnu|étranger|un homme|un vieux|vieillard)\b").unwrap().is_match(&t) {
        return true;
    }
    let weird_stranger = Regex::new(r"(?i)\b(homme étrange|femme étrange|n['’]était pas du village|manteau sombre)\b")
        .unwrap()
        .is_match(&t);
    let bag_prop = Regex::new(r"(?i)\b(sac|besace|provisions?)\b").unwrap().is_match(&t);
    if weird_stranger && bag_prop {
        return true;
    }
    let strangers = Regex::new(r"(?i)\b(voyageurs?|étrangers?|inconnus?|passants?|un homme|une femme)\b")
        .unwrap()
        .is_match(&t);
    let lost_kit = Regex::new(r"(?i)\b(sac|besace|provisions?|paquet|bourse)\b")
        .unwrap()
        .is_match(&t)
        && Regex::new(r"(?i)\b(perdu|perdue|égaré|égarée|retrouver|à la recherche)\b")
            .unwrap()
            .is_match(&t);
    let ask_help = Regex::new(r"(?i)\b(votre aide|aidez[- ]nous|compter sur|besoin de (toi|vous)|on a besoin)\b")
        .unwrap()
        .is_match(&t);
    if strangers && lost_kit && ask_help {
        return true;
    }
    if Regex::new(r"(?i)\b(nous avons perdu|ont perdu notre|perdu notre sac)\b")
        .unwrap()
        .is_match(&t)
        && ask_help
    {
        return true;
    }
    let tears = Regex::new(r"(?i)\b(larmes|en larmes|pleure|éplor)\b")
        .unwrap()
        .is_match(&t);
    let raiders = Regex::new(r"(?i)\b(brigands?|bandits?)\b").unwrap().is_match(&t);
    let crop = Regex::new(r"(?i)\b(blé|récolte|cargaison|champ)\b").unwrap().is_match(&t);
    tears && raiders && crop
}

pub fn opening_dumps_encyclopedia(content: &str) -> bool {
    let t = strip_opening_comments(content);
    static ENJEU: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\bEnjeu\s*:").expect("enjeu"));
    static PAYS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)\b(République|royaume)\b.{0,80}\bun pays de\b").expect("pays"));
    static CONFLIT: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)\bUn conflit naissant\b").expect("conflit"));
    static AUCUN: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)\bTes hommes sont avec toi\s*:\s*Aucun\b").expect("aucun"));
    ENJEU.is_match(&t) || PAYS.is_match(&t) || CONFLIT.is_match(&t) || AUCUN.is_match(&t)
}

pub fn opening_looks_like_stock_hook(content: &str) -> bool {
    let t = strip_opening_comments(content);
    let head = t.trim_start_matches(|c: char| c == '"' || c == '«' || c.is_whitespace());
    let head = head.chars().take(90).collect::<String>();
    static HEAD_OLD: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)^(Le vieux|Un vieux|Le vieillard|Un vieil homme|Un homme étrange)\b")
            .expect("head old")
    });
    if HEAD_OLD.is_match(&head) {
        return true;
    }
    let old_man = Regex::new(r"(?i)\b(le vieux|un vieux|le vieillard|barbe grise|barbe grisonnante|sa canne)\b")
        .unwrap()
        .is_match(&t);
    let bar = Regex::new(r"(?i)\b(chope|comptoir|bière fraîche|houblon)\b")
        .unwrap()
        .is_match(&t);
    let stranger = Regex::new(r"(?i)\b(homme étrange|n['’]était pas du village|manteau sombre|pas du village)\b")
        .unwrap()
        .is_match(&t);
    let bag = Regex::new(r"(?i)\b(sac de provisions|sac.{0,24}à la main)\b")
        .unwrap()
        .is_match(&t);
    if old_man && (stranger || bag) {
        return true;
    }
    if old_man && bar && stranger {
        return true;
    }
    stranger && bag
}

fn brief_activity(sheet: Option<&OpeningSheet>) -> Option<&str> {
    sheet
        .and_then(|s| s.creation_brief.as_ref())
        .and_then(|b| b.activity.as_deref())
}

pub fn opening_treats_guest_as_staff(content: &str, sheet: Option<&OpeningSheet>) -> bool {
    let t = strip_opening_comments(content);
    let innish = brief_activity(sheet) == Some("inn")
        || (brief_activity(sheet).is_none()
            && Regex::new(r"(?i)\b(taverne|auberge)\b").unwrap().is_match(&t));
    if !innish {
        return false;
    }
    static STAFF: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\b(tu ranges?|tu essuies?|tu sers |derrière le comptoir|dernière assiette|finir de ranger|tables rangées.{0,40}tes pas|prépar(?:e[rs]?|ant) un repas|voyageurs attendus|pommes de terre|cuillère de bois|fourneaux|en cuisine|tu (?:t['’]actives?|cuisin|pluches?|découpes?|mijotes?)|manipul(?:e[s]?|ent) des légumes)\b")
            .expect("staff")
    });
    STAFF.is_match(&t)
}

pub fn opening_invented_prior_favor(content: &str, sheet: Option<&OpeningSheet>) -> bool {
    let t = strip_opening_comments(content);
    static MEMORY: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\b(tu te souviens|vous souvenez[- ]vous|t['’]a déjà demandé|vous a déjà demandé|tu connais bien cette voix)\b")
            .expect("memory")
    });
    static WHEN: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\b(hier soir|l['’]an dernier|la semaine dernière|ce matin encore)\b")
            .expect("when")
    });
    static SERVICE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\b(déjà demandé|ce service|que j['’]ai laissé à ta table)\b").expect("service")
    });
    if MEMORY.is_match(&t) || (WHEN.is_match(&t) && SERVICE.is_match(&t)) {
        return true;
    }
    if brief_activity(sheet) == Some("trouble") {
        return false;
    }
    static DEBT: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\b(vieux prêt|vieille dette|prêt que tu (?:as )?oubli|dette que tu (?:as )?oubli|oublié d['’]apurer|as[- ]tu déjà entendu parler d['’]une dette|te rappelle un (?:vieux )?prêt)\b")
            .expect("debt")
    });
    DEBT.is_match(&t)
}

pub fn opening_speaks_for_player(content: &str) -> bool {
    let t = strip_opening_comments(content);
    static RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)\b(réponds[- ]tu|dis[- ]tu|lances[- ]tu)\b").expect("speak"));
    RE.is_match(&t)
}

pub fn opening_looks_like_qcm_menu(content: &str) -> bool {
    static QUESTIONS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)\b#{1,3}\s*Questions\b").expect("q"));
    if QUESTIONS.is_match(content) {
        return true;
    }
    static FUTURES: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?iu)\b[\p{L}]+eras[- ]tu\b").expect("futures"));
    if FUTURES.find_iter(content).count() >= 2 {
        return true;
    }
    static NUMBERED: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?m)^\s*\d+\.\s+\S.{8,}\?\s*$").expect("numbered"));
    NUMBERED.find_iter(content).count() >= 3
}

pub fn opening_skips_place_setup(content: &str) -> bool {
    let t = strip_opening_comments(content);
    let head: String = t.chars().take(220).collect();
    static NPC_HEAD: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)^(Le vieux|Un vieux|Le vieillard|Un homme|Une femme|Un inconnu)\b")
            .expect("npc head")
    });
    if NPC_HEAD.is_match(head.trim()) {
        return true;
    }
    static YOU: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)\b(tu |vous |tes |ton |ta |votre |vos )\b").expect("you"));
    !YOU.is_match(&head)
}

pub fn is_campaign_opening_too_thin(content: &str) -> bool {
    let t = strip_opening_comments(content);
    if t.len() < 80 {
        return true;
    }
    static Q: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)^que feras[- ]tu").expect("thin q"));
    Q.is_match(&t) && t.len() < 400
}

pub fn campaign_opening_unplayable_reasons(
    content: &str,
    host_name: &str,
    sheet: Option<&OpeningSheet>,
    mj_prose: Option<i32>,
) -> Vec<String> {
    let mut reasons = Vec::new();
    if is_campaign_opening_too_thin(content) {
        reasons.push("texte trop court".into());
    }
    if opening_treats_host_as_npc(content, host_name) {
        reasons.push("l'hôte est traité comme un PNJ".into());
    }
    if opening_invented_named_npc(content, host_name, sheet) {
        reasons.push("PNJ nommé hors fiche".into());
    }
    if opening_invented_family_secret(content, sheet) {
        reasons.push("secret familial inventé".into());
    }
    if opening_looks_like_quest_mcguffin(content) {
        reasons.push("quête / objet perdu inventé".into());
    }
    if opening_looks_like_stock_hook(content) {
        reasons.push("cliché vieux + étranger au sac".into());
    }
    if opening_treats_guest_as_staff(content, sheet) {
        reasons.push("le joueur est en cuisine / service au lieu d'être client".into());
    }
    if opening_invented_prior_favor(content, sheet) {
        reasons.push("dette ou faveur d'hier inventée".into());
    }
    if opening_speaks_for_player(content) {
        reasons.push("réplique du PJ écrite par le MJ".into());
    }
    if opening_looks_like_qcm_menu(content) {
        reasons.push("questionnaire 1/2/3 au lieu d'une relance".into());
    }
    if opening_skips_place_setup(content) {
        reasons.push("pas de pose du lieu à la 2e personne".into());
    }
    if opening_dumps_encyclopedia(content) {
        reasons.push("fiche pays / Enjeu :".into());
    }
    if opening_too_many_places(content, mj_prose) {
        reasons.push("trop de lieux".into());
    }
    if opening_too_ornate(content, mj_prose) {
        reasons.push("trop romancé".into());
    }
    reasons
}

pub fn opening_quality(
    content: &str,
    host_name: &str,
    sheet: Option<&OpeningSheet>,
    mj_prose: Option<i32>,
) -> OpeningQuality {
    let reasons = campaign_opening_unplayable_reasons(content, host_name, sheet, mj_prose);
    OpeningQuality {
        unplayable: !reasons.is_empty(),
        reasons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const THORIN: &str = r#"
La rivière qui serpente au bord du campement des Ombres se reflète dans les feux de camp.
Au centre de ce petit havre, Thorin Brume‑Fine, cuirassé et couronné de l'emblème de la Garde de l'Aube, se tient debout, son regard fixé sur la lueur rougeoyante des braises.

« Vous êtes arrivés à l'heure, » dit-il, la voix grave mais calme. « J'ai besoin d'une équipe fiable. »

Le chevalier hoche la tête, puis se tourne vers vous. « Vous avez le choix : vous pouvez suivre Thorin jusqu'au bord de la rivière. »

Thorin vous regarde, son regard déterminé comme le métal.

Que choisissez-vous d'abord ?
Inspecter la rive et repérer les traces de passage des brigands.
"#;

    const SERA: &str = r#"
Tu es Sera Lame‑Douce, chevalier de la Couronne d’Argent, marchant dans les ruelles étroites de Murmures.
La nuit est fraîche, mais le vent qui s’échappe de la chapelle des Brumes porte un parfum de bois brûlé et des murmures lointains.
Les lanternes aux lueurs argentées projettent des ombres dansantes sur les pierres anciennes de la porte.
Tu sens l’écho d’une présence silencieuse derrière toi : Sir Aldric, Gardien de la Couronne, tient un parchemin.
Un murmure se fait entendre dans la ruelle, comme si les murs eux-mêmes cherchaient à te parler.
Sir Aldric murmure : « La vérité sur ton père se cache ici, mais elle n’est pas sans danger. »
"#;

    const BABU: &str = r#"
Sous le grand chêne qui tranche la route, le crépitement d'un petit feu éclaire les visages fatigués de Babu.
Un homme aux habits sales s'avance. « Nous avons perdu notre sac, pouvons-nous compter sur votre aide pour le retrouver ? »
Babu doit décider : partager ce qu'il a, aider les voyageurs, ou les repousser.
"#;

    const JROUNCH: &str = r#"
Tu es Jrounch le jrunch, Villageois. Tes hommes sont avec toi : Aucun. Je vis ici depuis toujours, paysan, à l'auberge ou à la taverne.

Jrounch le jrunch se trouve dans l'auberge du village, en train de servir un verre de bière aux villageois.

Un voisin, le vieux Maître Lien, arrive en larmes, expliquant que des brigands ont volé la dernière cargaison de blé et menacent de détruire le champ.

Autour de toi : Auberge du village. Tension palpable.

La République de Zargard-gar, un pays de plaines fertiles et de villages paisibles.

Enjeu : Un conflit naissant entre les agriculteurs du village et un groupe de brigands qui s'approprie les récoltes.
"#;

    const CHING: &str = r#"
Le vieux, sa barbe grise tremblante, s'approche du comptoir où vous sirotez votre chope. Le parfum de bois brûlé et de bière fraîche flotte dans l'air. Il baisse la voix, s’appuyant sur sa canne.
« J’ai vu un homme étrange sortir du comptoir, sac de provisions à la main. Il portait un manteau sombre, et ses pas étaient pressés. Il n’était pas du village, j’en suis sûr. »
L’odeur de houblon se mêle à un léger parfum de bois de santal que dégage son manteau.
Vous pouvez répondre, regarder autour, ou demander plus de détails.
Que faites‑vous ?
"#;

    const KAEL: &str = r#"
La taverne du Héros Fatigué s'éclaire d'une lueur tamisée. Il est presque 19h, et tu ranges la dernière assiette de la soirée.
Soudain, un homme à la barbe grisonnante s'avance vers toi. Il tient un petit sac de pain.
« Tu te souviens du morceau de pain que j'ai laissé à ta table hier soir ? » Il t'a déjà demandé ce service.
Que fais-tu ?
"#;

    const YODELI: &str = r#"
Tu es dans la grande salle de l'Auberge du Griffon. Tu t'actives en préparant un repas simple pour les voyageurs attendus. Tes mains manipulent des légumes et une cuillère de bois.
Tu es en train de couper des pommes de terre lorsque le propriétaire, un homme nommé Gauthier, s'approche.
« Yodeli yodelou, as-tu déjà entendu parler d'une dette ? »
Tu connais bien cette voix, et tu sais qu'il te rappelle un vieux prêt que tu as oublié d'apurer.
« Je… Bien sûr, » réponds-tu. « Quel montant devais-je t'avancer, Gauthier ? »
### Questions
1. Laisseras-tu Gauthier te rappeler devant tout le monde ?
2. Chercheras-tu un moyen d'arranger les choses avec lui rapidement ?
3. Essaieras-tu de trouver des clients en retard qui pourraient t'aider ?
"#;

    fn peasant_inn() -> OpeningSheet {
        OpeningSheet {
            rank: Some("Villageois".into()),
            creation_brief: Some(OpeningBrief {
                activity: Some("inn".into()),
                station: Some("peasant".into()),
                past: Some("local".into()),
            }),
            ..Default::default()
        }
    }

    #[test]
    fn trop_mince() {
        assert!(is_campaign_opening_too_thin("Que feras-tu ?"));
    }

    #[test]
    fn thorin_pnj() {
        assert!(opening_treats_host_as_npc(THORIN, "Thorin Brume-Fine"));
        assert!(opening_quality(THORIN, "Thorin Brume-Fine", None, None).unplayable);
        assert!(!opening_treats_host_as_npc(
            "Tu es Thorin Brume-Fine. Tes hommes attendent. Un éclaireur revient de la rive. Que fais-tu ?",
            "Thorin Brume-Fine"
        ));
    }

    #[test]
    fn meme_personne() {
        assert!(names_refer_to_same_person("Thorin Brume-Fine", "Thorin Brume‑Fine"));
        assert!(names_refer_to_same_person("Thorin Brume-Fine", "Thorin"));
        assert!(!names_refer_to_same_person("Thorin", "Mira"));
    }

    #[test]
    fn parchemin_crypté() {
        let text = "Vous êtes assis au comptoir. Un homme aux yeux perçants dépose un parchemin griffonné puis se fond rapidement dans la foule. « L'éclat de la mer se cache sous le soleil couchant. Trouvez le phare d'argent. » Que faites-vous ?";
        assert!(opening_looks_like_quest_mcguffin(text));
    }

    #[test]
    fn babu_sac() {
        assert!(opening_looks_like_quest_mcguffin(BABU));
        assert!(opening_treats_host_as_npc(BABU, "Babu"));
    }

    #[test]
    fn sera_sir_aldric() {
        let sheet = OpeningSheet {
            rank: Some("Chevalier".into()),
            ..Default::default()
        };
        assert!(opening_invented_named_npc(SERA, "Sera Lame-Douce", Some(&sheet)));
        assert!(opening_invented_family_secret(SERA, Some(&sheet)));
        assert!(opening_quality(SERA, "Sera Lame-Douce", Some(&sheet), Some(20)).unplayable);
    }

    #[test]
    fn jrounch_encyclopedie() {
        assert!(opening_invented_named_npc(JROUNCH, "Jrounch le jrunch", None));
        assert!(opening_treats_host_as_npc(JROUNCH, "Jrounch le jrunch"));
        assert!(opening_looks_like_quest_mcguffin(JROUNCH));
        assert!(opening_dumps_encyclopedia(JROUNCH));
    }

    #[test]
    fn ching_vieux() {
        assert!(opening_looks_like_stock_hook(CHING));
        assert!(opening_looks_like_quest_mcguffin(CHING));
        assert!(opening_skips_place_setup(CHING));
    }

    #[test]
    fn kael_serveur() {
        let sheet = peasant_inn();
        assert!(opening_treats_guest_as_staff(KAEL, Some(&sheet)));
        assert!(opening_invented_prior_favor(KAEL, None));
        assert!(opening_quality(KAEL, "Kael Sans-Carte", Some(&sheet), None).unplayable);
    }

    #[test]
    fn client_auberge_jouable() {
        let sheet = peasant_inn();
        let text = "Tu es à la taverne du Héros Fatigué, une chope à la main, assis à ta table habituelle. Le feu crépite. La tenancière essuie trop longtemps le même verre. Ton banc d'habitude n'est pas libre. Que fais-tu ?";
        assert!(!opening_treats_guest_as_staff(text, Some(&sheet)));
        assert!(!opening_invented_prior_favor(text, Some(&sheet)));
        assert!(!opening_quality(text, "Kael Sans-Carte", Some(&sheet), None).unplayable);
    }

    #[test]
    fn yodeli_cuisine() {
        let sheet = peasant_inn();
        assert!(opening_treats_guest_as_staff(YODELI, Some(&sheet)));
        assert!(opening_invented_prior_favor(YODELI, Some(&sheet)));
        assert!(opening_invented_named_npc(YODELI, "Yodeli yodelou", Some(&sheet)));
        assert!(opening_speaks_for_player(YODELI));
        assert!(opening_looks_like_qcm_menu(YODELI));
        let q = opening_quality(YODELI, "Yodeli yodelou", Some(&sheet), None);
        assert!(q.unplayable);
        assert!(q.reasons.iter().any(|r| r.contains("cuisine") || r.contains("service")));
        assert!(q.reasons.iter().any(|r| r.contains("dette") || r.contains("faveur")));
    }
}
