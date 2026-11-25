//! Pure Rust OTEL data types and transformations.

pub mod attributes;
pub mod event_skills;
pub mod events;
pub mod input;
pub mod metadata;
pub mod providers;
pub mod tools;
pub mod types;
pub mod value;

#[cfg(test)]
mod value_properties;

pub use events::{process_to_events, EventBuildConfig};
pub use types::{OwnedEvent, StorageContext};
