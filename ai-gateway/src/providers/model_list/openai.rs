use chrono::DateTime;
use serde::Serialize;

use super::CatalogEntry;
use crate::resolution::ResolutionError;

// API contract: https://developers.openai.com/api/reference/resources/models/methods/list
#[derive(Serialize)]
struct Response<'a> {
    object: &'static str,
    data: Vec<Model<'a>>,
}

#[derive(Serialize)]
struct Model<'a> {
    id: &'a str,
    object: &'static str,
    created: i64,
    owned_by: &'static str,
}

pub(super) fn response(entries: &[CatalogEntry]) -> Result<Vec<u8>, ResolutionError> {
    let data = entries
        .iter()
        .map(|entry| {
            let created = DateTime::parse_from_rfc3339(&entry.created_at)
                .map_err(|_| ResolutionError::InvalidResponse)?
                .timestamp();
            if created < 0 {
                return Err(ResolutionError::InvalidResponse);
            }
            Ok(Model {
                id: &entry.id,
                object: "model",
                created,
                owned_by: "openai",
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    serde_json::to_vec(&Response {
        object: "list",
        data,
    })
    .map_err(|_| ResolutionError::InvalidResponse)
}
