use super::*;
use serde_json::json;

#[test]
fn input_is_the_body_as_sent() {
    let body = br#"{"z": [1, {"a": 2}], "model": "m", "mod\u0065": 1, "model": "n"}"#;
    let mut members = RequestMembers::parse(body).unwrap();
    assert_eq!(members.value("model"), Some(json!("n")));
    assert_eq!(members.value("mode"), Some(json!(1)));
    assert_eq!(
        members.into_input().unwrap().get().as_bytes(),
        body.as_slice()
    );
}

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

#[test]
fn only_a_single_json_object_is_accepted() {
    for body in [&b"[]"[..], b"\"x\"", b"{} {}", b"{\"a\":}", b""] {
        assert!(RequestMembers::parse(body).is_err(), "{body:?}");
    }
}
