use serde_json::{Map, Value};

/// The receiver's native `OpenAI` usage schemas are strict at the top level, but
/// accept new numeric detail counters.
pub(super) fn project_openai_usage(
    usage: &Value,
    counters: [&str; 3],
    details: [&str; 2],
) -> Option<Value> {
    let usage = usage.as_object()?;
    let mut projected = Map::new();
    for key in counters {
        let value = usage.get(key).filter(|value| value.as_u64().is_some())?;
        projected.insert(key.into(), value.clone());
    }
    for key in details {
        match usage.get(key) {
            Some(Value::Null) => {
                projected.insert(key.into(), Value::Null);
            }
            Some(Value::Object(details)) => {
                projected.insert(
                    key.into(),
                    Value::Object(
                        details
                            .iter()
                            .filter(|(_, value)| value.is_null() || value.as_u64().is_some())
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect(),
                    ),
                );
            }
            _ => {}
        }
    }
    Some(Value::Object(projected))
}
