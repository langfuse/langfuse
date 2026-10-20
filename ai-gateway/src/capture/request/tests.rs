use super::*;
use serde_json::json;

#[test]
fn members_over_the_parse_budget_are_not_parsed() {
    let large = "a".repeat(MAX_PARSED_BYTES);
    let body =
        serde_json::to_vec(&json!({"text": large, "user": "u", "metadata": {"m": 1}})).unwrap();
    let mut members = RequestMembers::parse(&body).unwrap();
    assert_eq!(members.value("text"), None);
    assert_eq!(members.value("user"), Some(json!("u")));
    assert_eq!(members.value_within("metadata", 4), None);
    assert_eq!(
        members.value_within("metadata", 1024),
        Some(json!({"m": 1}))
    );
}
