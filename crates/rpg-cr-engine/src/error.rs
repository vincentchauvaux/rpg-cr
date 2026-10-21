use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Réponse LLM vide ({0})")]
    Empty(String),
    #[error("Réponse LLM sans JSON ({0})")]
    NoJson(String),
    #[error("JSON invalide ({0})")]
    InvalidJson(String),
}
