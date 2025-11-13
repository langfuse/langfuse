pub(crate) use de::deserialize_row;
pub(crate) use ser::serialize_row_binary;
pub(crate) use ser::serialize_with_validation;

pub(crate) mod validation;

mod de;
mod ser;
#[cfg(test)]
mod tests;
mod utils;
