use serde_json::Value;

use crate::EngineError;

/// Premier objet `{…}` équilibré, y compris dans un bloc markdown.
pub fn extract_json_object(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let fence = regex::Regex::new(r"(?is)```(?:json)?\s*(\{.*?\})\s*```")
        .expect("fence regex");
    if let Some(cap) = fence.captures(trimmed) {
        if let Some(m) = cap.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    let bytes = trimmed.as_bytes();
    let start = trimmed.find('{')?;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut esc = false;
    for (i, &c) in bytes.iter().enumerate().skip(start) {
        if in_str {
            if esc {
                esc = false;
                continue;
            }
            if c == b'\\' {
                esc = true;
                continue;
            }
            if c == b'"' {
                in_str = false;
            }
            continue;
        }
        if c == b'"' {
            in_str = true;
            continue;
        }
        if c == b'{' {
            depth += 1;
        }
        if c == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(trimmed[start..=i].to_string());
            }
        }
    }
    let from = trimmed.find('{')?;
    let to = trimmed.rfind('}')?;
    if to > from {
        Some(trimmed[from..=to].to_string())
    } else {
        None
    }
}

pub fn parse_character_sheet_json(raw: &str, label: &str) -> Result<Value, EngineError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(EngineError::Empty(label.to_string()));
    }
    let json = extract_json_object(trimmed).ok_or_else(|| EngineError::NoJson(label.to_string()))?;
    let parsed: Value =
        serde_json::from_str(&json).map_err(|_| EngineError::InvalidJson(label.to_string()))?;
    if !parsed.is_object() {
        return Err(EngineError::InvalidJson(label.to_string()));
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuse_texte_libre() {
        let err = parse_character_sheet_json("Le héros est un guerrier vaillant.", "histoire")
            .unwrap_err();
        assert!(err.to_string().contains("sans JSON"));
    }

    #[test]
    fn refuse_json_casse() {
        let err = parse_character_sheet_json("{ rank: }", "histoire").unwrap_err();
        assert!(err.to_string().contains("JSON invalide"));
    }

    #[test]
    fn accepte_objet_nu() {
        let ok = parse_character_sheet_json(r#"{"rank":"Baron"}"#, "histoire").unwrap();
        assert_eq!(ok["rank"], "Baron");
    }

    #[test]
    fn accepte_fence_markdown() {
        let raw = "Voici la fiche :\n```json\n{\"rank\":\"Baronne\",\"background\":\"Fille du fleuve\"}\n```";
        let ok = parse_character_sheet_json(raw, "histoire").unwrap();
        assert_eq!(ok["rank"], "Baronne");
    }
}
