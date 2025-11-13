#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
#[doc(hidden)]
pub enum TypesError {
    #[error("not enough data: {0}")]
    NotEnoughData(String),
    #[error("type parsing error: {0}")]
    TypeParsingError(String),
    #[error("unexpected empty list of columns")]
    EmptyColumns,
}
