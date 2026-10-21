use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlignmentId {
    LawfulGood,
    NeutralGood,
    ChaoticGood,
    LawfulNeutral,
    TrueNeutral,
    ChaoticNeutral,
    LawfulEvil,
    NeutralEvil,
    ChaoticEvil,
}

impl AlignmentId {
    pub fn label(self) -> &'static str {
        match self {
            Self::LawfulGood => "Loyal Bon",
            Self::NeutralGood => "Neutre Bon",
            Self::ChaoticGood => "Chaotique Bon",
            Self::LawfulNeutral => "Loyal Neutre",
            Self::TrueNeutral => "Neutre Pur",
            Self::ChaoticNeutral => "Chaotique Neutre",
            Self::LawfulEvil => "Loyal Mauvais",
            Self::NeutralEvil => "Neutre Mauvais",
            Self::ChaoticEvil => "Chaotique Mauvais",
        }
    }
}

pub fn normalize_alignment(raw: Option<&str>) -> Option<AlignmentId> {
    let s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    serde_json::from_value(serde_json::Value::String(s.to_string())).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_fr() {
        assert_eq!(AlignmentId::TrueNeutral.label(), "Neutre Pur");
        assert_eq!(normalize_alignment(Some("chaotic_good")), Some(AlignmentId::ChaoticGood));
        assert_eq!(normalize_alignment(Some("")), None);
    }
}
