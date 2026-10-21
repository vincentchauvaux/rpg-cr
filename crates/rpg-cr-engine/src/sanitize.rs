use std::sync::LazyLock;

use regex::Regex;

const MIN_NARRATIVE_BEFORE_CUT: usize = 20;

static LEAK_MARKERS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)\bThinking Process\s*:",
        r"(?i)\bFinal Output Generation\b",
        r"(?i)\bChain of Thought\s*:",
        r"(?i)\bReasoning Process\s*:",
        r"(?i)\*\*Analyze the Request:\*\*",
        r"(?i)\*\*Review(?: the)? Current Context:\*\*",
        r"(?i)\*\*Consider(?:ation)?(?:s)?:\*\*",
        r"(?i)\*\*Draft(?:ing)?(?: Output)?:\*\*",
        r"(?i)\*\*Plan(?:ning)?:\*\*",
        r"(?i)\*\*Step \d+\s*[-–—:]?\*\*",
        r"(?im)(?:^|\n)\d+\.\s*\*\*(?:Analyze|Review|Consider|Draft|Plan|Final|Output|Generate)",
        r"(?im)(?:^|\n)#{1,3}\s*Thinking\b",
        r"(?im)(?:^|\n)Analysis\s*:",
    ]
    .into_iter()
    .map(|p| Regex::new(p).expect("leak marker"))
    .collect()
});

static THINK_TAGS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?is)<think>.*?</think>").expect("think"),
        Regex::new(r"(?is)<redacted_reasoning>.*?</redacted_reasoning>").expect("reasoning"),
    ]
});

static META_CLOSERS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?iu)quelles?\s+(?:seront|sont|seraient)\s+(?:vos|tes)\s+prochaine?s?\s+actions?\s*\?",
        r"(?iu)quelles?\s+actions?\s+(?:souhaitez|voulez|comptez)[- ]vous\s+(?:entreprendre|mener|faire)\s*\?",
        r"(?iu)quelles?\s+actions?\s+(?:souhaites|veux|comptes)[- ]tu\s+(?:entreprendre|mener|faire)\s*\?",
        r"(?iu)quelle\s+est\s+(?:votre|ta)\s+prochaine\s+action\s*\?",
        r"(?iu)que\s+d[ée]cidez[- ]vous\s+d['’]entreprendre\s*\?",
    ]
    .into_iter()
    .map(|p| Regex::new(p).expect("meta closer"))
    .collect()
});

fn strip_think_tags(text: &str) -> String {
    let mut out = text.to_string();
    for re in THINK_TAGS.iter() {
        out = re.replace_all(&out, "").into_owned();
    }
    out.trim().to_string()
}

fn earliest_leak_index(text: &str) -> Option<usize> {
    LEAK_MARKERS
        .iter()
        .filter_map(|re| re.find(text).map(|m| m.start()))
        .min()
}

pub fn rewrite_table_meta_closers(text: &str) -> String {
    let mut out = text.to_string();
    for re in META_CLOSERS.iter() {
        out = re.replace_all(&out, "Que fais‑tu ?").into_owned();
    }
    out
}

fn clause_parts(s: &str) -> Vec<(String, String)> {
    static CLAUSE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?u)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s''\-]{1,55}?)([.…!?])").expect("clause")
    });
    CLAUSE
        .captures_iter(s)
        .filter_map(|c| Some((c.get(1)?.as_str().to_string(), c.get(2)?.as_str().to_string())))
        .collect()
}

pub fn collapse_trailing_phrase_loop(text: &str) -> String {
    let out = text.trim().to_string();
    if out.is_empty() {
        return out;
    }
    let mut paragraphs: Vec<String> = out.split("\n\n").map(|s| s.trim().to_string()).collect();
    if let Some(last) = paragraphs.last_mut() {
        let parts = clause_parts(last);
        if parts.len() >= 4 {
            let first = &parts[0];
            let start_run = parts.iter().take_while(|p| *p == first).count();
            if start_run >= 4 {
                *last = format!("{}{}", first.0.trim(), first.1);
                return paragraphs.join("\n\n").trim().to_string();
            }
        }
    }
    let parts = clause_parts(&out);
    if parts.len() >= 5 {
        let last = parts.last().unwrap();
        let n = parts.iter().rev().take_while(|p| *p == last).count();
        if n >= 5 {
            let keep = parts.len() - n + 1;
            return parts[..keep]
                .iter()
                .map(|(a, b)| format!("{}{}", a.trim(), b))
                .collect::<Vec<_>>()
                .join(" ");
        }
    }
    out
}

fn trim_trailing_leak_block(text: &str) -> String {
    static TRAILING: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)\n{2,}(?:\d+\.\s*\*\*(?:Analyze|Review|Consider|Draft|Plan|Final)[\s\S]*)$")
            .expect("trailing leak")
    });
    if let Some(m) = TRAILING.find(text) {
        if m.start() >= MIN_NARRATIVE_BEFORE_CUT {
            return text[..m.start()].trim().to_string();
        }
    }
    text.to_string()
}

pub fn sanitize_mj_response(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut out = strip_think_tags(trimmed);
    if let Some(leak_at) = earliest_leak_index(&out) {
        if leak_at >= MIN_NARRATIVE_BEFORE_CUT {
            out = out[..leak_at].trim().to_string();
        } else {
            let after = &out[leak_at..];
            let head = after.chars().take(120).collect::<String>();
            if LEAK_MARKERS.iter().any(|re| re.is_match(&head)) {
                out.clear();
            }
        }
    }
    out = trim_trailing_leak_block(&out);
    out = collapse_trailing_phrase_loop(&out);
    out = rewrite_table_meta_closers(&out);
    static MANY_NL: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\n{3,}").expect("newlines"));
    MANY_NL.replace_all(&out, "\n\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coupe_thinking_process() {
        let raw = "Le vent souffle sur la place.\n\nThinking Process: 1. **Analyze the Request:** …";
        let out = sanitize_mj_response(raw);
        assert!(out.contains("Le vent souffle"));
        assert!(!out.contains("Thinking Process"));
    }

    #[test]
    fn relance_meta() {
        let out = sanitize_mj_response("Le feu crépite. Quelles seront vos prochaines actions ?");
        assert!(out.contains("Que fais"));
        assert!(!out.to_lowercase().contains("prochaines actions"));
    }
}
