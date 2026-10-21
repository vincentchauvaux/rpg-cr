use serde::{Deserialize, Serialize};

pub fn clamp_stat(value: f64) -> i32 {
    if !value.is_finite() {
        return 10;
    }
    (value.round() as i32).clamp(1, 20)
}

pub fn stat_modifier(score: i32) -> i32 {
    (clamp_stat(score as f64) - 10).div_euclid(2)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SceneCheckMode {
    #[serde(rename = "dc")]
    Dc,
    Opposed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SceneCheckOutcomeKind {
    Success,
    Failure,
    ContestWin,
    ContestLoss,
    Tie,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSceneCheckInput {
    pub actor_kept_natural: i32,
    pub actor_modifier: i32,
    pub actor_total: i32,
    pub dc: i32,
    pub mode: SceneCheckMode,
    pub opposers: Vec<i32>,
    pub world_total: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSceneCheckOutput {
    pub outcome: SceneCheckOutcomeKind,
    pub outcome_line: String,
    pub opposition_total: Option<i32>,
}

pub fn resolve_scene_check_outcome(input: &ResolveSceneCheckInput) -> ResolveSceneCheckOutput {
    let player_opp = input.opposers.iter().copied().max().unwrap_or(0);
    let contested = input.mode == SceneCheckMode::Opposed || !input.opposers.is_empty();

    let crit = if input.actor_kept_natural == 20 {
        " — 20 naturel"
    } else if input.actor_kept_natural == 1 {
        " — 1 naturel"
    } else {
        ""
    };

    if !contested {
        if input.actor_total >= input.dc {
            return ResolveSceneCheckOutput {
                outcome: SceneCheckOutcomeKind::Success,
                outcome_line: format!(
                    "réussite ({} ≥ DD {}{}).",
                    input.actor_total, input.dc, crit
                ),
                opposition_total: None,
            };
        }
        return ResolveSceneCheckOutput {
            outcome: SceneCheckOutcomeKind::Failure,
            outcome_line: format!(
                "échec ({} < DD {}{}).",
                input.actor_total, input.dc, crit
            ),
            opposition_total: None,
        };
    }

    let mut parts: Vec<i32> = Vec::new();
    if !input.opposers.is_empty() {
        parts.push(player_opp);
    }
    if input.mode == SceneCheckMode::Opposed {
        if let Some(w) = input.world_total {
            parts.push(w);
        }
    }
    let opposition_total = parts
        .into_iter()
        .max()
        .or(input.world_total)
        .unwrap_or(input.dc);

    let contest_crit = if input.actor_kept_natural == 20 {
        " (20 naturel)"
    } else if input.actor_kept_natural == 1 {
        " (1 naturel)"
    } else {
        ""
    };

    if input.actor_total > opposition_total {
        ResolveSceneCheckOutput {
            outcome: SceneCheckOutcomeKind::ContestWin,
            outcome_line: format!(
                "l'emporte {} contre {}{}.",
                input.actor_total, opposition_total, contest_crit
            ),
            opposition_total: Some(opposition_total),
        }
    } else if input.actor_total < opposition_total {
        ResolveSceneCheckOutput {
            outcome: SceneCheckOutcomeKind::ContestLoss,
            outcome_line: format!(
                "l'opposition l'emporte {} contre {}{}.",
                opposition_total, input.actor_total, contest_crit
            ),
            opposition_total: Some(opposition_total),
        }
    } else {
        ResolveSceneCheckOutput {
            outcome: SceneCheckOutcomeKind::Tie,
            outcome_line: format!(
                "égalité {} partout — la situation ne bascule pas{}.",
                input.actor_total, contest_crit
            ),
            opposition_total: Some(opposition_total),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modificateur_dnd() {
        assert_eq!(stat_modifier(10), 0);
        assert_eq!(stat_modifier(8), -1);
        assert_eq!(stat_modifier(18), 4);
        assert_eq!(stat_modifier(1), -5);
    }

    #[test]
    fn reussite_contre_dd() {
        let out = resolve_scene_check_outcome(&ResolveSceneCheckInput {
            actor_kept_natural: 12,
            actor_modifier: 2,
            actor_total: 14,
            dc: 12,
            mode: SceneCheckMode::Dc,
            opposers: vec![],
            world_total: None,
        });
        assert_eq!(out.outcome, SceneCheckOutcomeKind::Success);
    }

    #[test]
    fn egalite_contestee() {
        let out = resolve_scene_check_outcome(&ResolveSceneCheckInput {
            actor_kept_natural: 10,
            actor_modifier: 0,
            actor_total: 15,
            dc: 10,
            mode: SceneCheckMode::Opposed,
            opposers: vec![],
            world_total: Some(15),
        });
        assert_eq!(out.outcome, SceneCheckOutcomeKind::Tie);
    }
}
