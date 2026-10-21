use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use rpg_cr_engine::{
    opening_quality, parse_character_sheet_json, resolve_scene_check_outcome, sanitize_mj_response,
    OpeningSheet, ResolveSceneCheckInput,
};

#[derive(Deserialize)]
struct ParseSheetReq {
    raw: String,
    #[serde(default = "histoire")]
    label: String,
}

fn histoire() -> String {
    "histoire".into()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpeningReq {
    content: String,
    host_name: String,
    sheet: Option<OpeningSheet>,
    mj_prose: Option<i32>,
}

#[derive(Deserialize)]
struct SanitizeReq {
    text: String,
}

#[derive(Serialize)]
struct Health {
    ok: bool,
    engine: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        ok: true,
        engine: "rpg-cr-engine",
    })
}

async fn parse_sheet(Json(req): Json<ParseSheetReq>) -> impl IntoResponse {
    match parse_character_sheet_json(&req.raw, &req.label) {
        Ok(sheet) => (StatusCode::OK, Json(json!({ "ok": true, "sheet": sheet }))).into_response(),
        Err(e) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "ok": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn opening(Json(req): Json<OpeningReq>) -> Json<Value> {
    let q = opening_quality(
        &req.content,
        &req.host_name,
        req.sheet.as_ref(),
        req.mj_prose,
    );
    Json(json!({
        "ok": true,
        "unplayable": q.unplayable,
        "reasons": q.reasons,
    }))
}

async fn sanitize(Json(req): Json<SanitizeReq>) -> Json<Value> {
    Json(json!({ "ok": true, "text": sanitize_mj_response(&req.text) }))
}

async fn scene_check(Json(req): Json<ResolveSceneCheckInput>) -> Json<Value> {
    let out = resolve_scene_check_outcome(&req);
    Json(json!({ "ok": true, "outcome": out }))
}

#[tokio::main]
async fn main() {
    let host = std::env::var("RPG_CR_ENGINE_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port = std::env::var("RPG_CR_ENGINE_PORT").unwrap_or_else(|_| "4020".into());
    let addr = format!("{host}:{port}");

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/parse-sheet", post(parse_sheet))
        .route("/v1/opening-quality", post(opening))
        .route("/v1/sanitize", post(sanitize))
        .route("/v1/scene-check", post(scene_check));

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("moteur Rust impossible à lier sur {addr}: {e}"));
    eprintln!("moteur Rust RPG-CR sur http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("moteur Rust");
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
