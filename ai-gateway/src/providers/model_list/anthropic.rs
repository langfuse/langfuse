use chrono::DateTime;
use serde::Serialize;

use super::CatalogEntry;
use crate::resolution::ResolutionError;

// API contract: https://platform.claude.com/docs/en/api/models/list
#[derive(Serialize)]
struct Response<'a> {
    data: Vec<Model<'a>>,
    has_more: bool,
    first_id: Option<&'a str>,
    last_id: Option<&'a str>,
}

#[derive(Serialize)]
struct Model<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    id: &'a str,
    display_name: &'a str,
    created_at: &'a str,
}

pub(super) fn response(entries: &[CatalogEntry]) -> Result<Vec<u8>, ResolutionError> {
    let data = entries
        .iter()
        .map(|entry| {
            DateTime::parse_from_rfc3339(&entry.created_at)
                .map_err(|_| ResolutionError::InvalidResponse)?;
            Ok(Model {
                kind: "model",
                id: &entry.id,
                display_name: &entry.display_name,
                created_at: &entry.created_at,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    serde_json::to_vec(&Response {
        data,
        has_more: false,
        first_id: entries.first().map(|entry| entry.id.as_str()),
        last_id: entries.last().map(|entry| entry.id.as_str()),
    })
    .map_err(|_| ResolutionError::InvalidResponse)
}
