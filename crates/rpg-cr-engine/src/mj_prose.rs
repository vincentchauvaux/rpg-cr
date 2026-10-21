use std::sync::LazyLock;

use regex::Regex;

pub const MJ_PROSE_DEFAULT: i32 = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MjProseBand {
    Blunt,
    Sober,
    Lush,
}

pub fn normalize_mj_prose(value: Option<i32>) -> i32 {
    match value {
        Some(n) => n.clamp(0, 100),
        None => MJ_PROSE_DEFAULT,
    }
}

pub fn mj_prose_band(value: Option<i32>) -> MjProseBand {
    let n = normalize_mj_prose(value);
    if n <= 33 {
        MjProseBand::Blunt
    } else if n <= 66 {
        MjProseBand::Sober
    } else {
        MjProseBand::Lush
    }
}

static ORNATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)comme si|semblent?\b|murmur|ombres dansantes|vibre|cœur qui bat|coeur qui bat|parfum de|lueurs argent|pierres anciennes")
        .expect("ornate")
});

const PLACE_WORDS: &[&str] = &[
    "ruelle",
    "chapelle",
    "auberge",
    "taverne",
    "caserne",
    "marché",
    "temple",
    "rivière",
    "campement",
    "forteresse",
    "sanctuaire",
];

fn strip_comments(content: &str) -> String {
    static RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?s)<!--.*?-->").expect("comments"));
    RE.replace_all(content, "").into_owned()
}

pub fn opening_too_ornate(content: &str, mj_prose: Option<i32>) -> bool {
    if mj_prose_band(mj_prose) == MjProseBand::Lush {
        return false;
    }
    let t = strip_comments(content);
    let hits = ORNATE_RE.find_iter(&t).count();
    if mj_prose_band(mj_prose) == MjProseBand::Blunt {
        hits >= 3
    } else {
        hits >= 6
    }
}

pub fn opening_too_many_places(content: &str, mj_prose: Option<i32>) -> bool {
    if mj_prose_band(mj_prose) == MjProseBand::Lush {
        return false;
    }
    let t = strip_comments(content).to_lowercase();
    let hits = PLACE_WORDS.iter().filter(|w| t.contains(*w)).count();
    hits >= 3
}
