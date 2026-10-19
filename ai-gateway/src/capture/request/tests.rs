use super::*;
use serde_json::json;

fn input(members: RequestMembers<'_>) -> Value {
    serde_json::from_str(members.into_input().unwrap().get()).unwrap()
}

#[test]
fn unprojected_members_stay_raw_in_request_order() {
    let body = br#"{"z": [1, {"a": 2}], "model": "m", "mod\u0065": 1, "b\"q": null}"#;
    let mut members = RequestMembers::parse(body, &["model"], true).unwrap();
    assert_eq!(members.take_value("model"), Some(json!("m")));
    assert_eq!(
        members.into_input().unwrap().get(),
        r#"{"z":[1, {"a": 2}],"mode":1,"b\"q":null}"#
    );
}

#[test]
fn repeated_projected_key_keeps_the_last_value() {
    let body = br#"{"model": "a", "input": [], "model": "b"}"#;
    let mut members = RequestMembers::parse(body, &["model"], true).unwrap();
    assert_eq!(members.take_value("model"), Some(json!("b")));
    assert_eq!(input(members), json!({"input": []}));
}

#[test]
fn untaken_and_over_budget_members_stay_in_the_input() {
    let large = "a".repeat(MAX_PROJECTED_BYTES);
    let body = serde_json::to_vec(&json!({
        "text": large,
        "user": "u",
        "metadata": {"m": 1},
        "input": "hi",
    }))
    .unwrap();
    let mut members = RequestMembers::parse(&body, &["text", "user", "metadata"], true).unwrap();
    assert_eq!(members.take_value("text"), None);
    assert_eq!(members.take_value("user"), Some(json!("u")));
    assert_eq!(members.take_value_within("metadata", 1024, |_| false), None);
    assert_eq!(
        input(members),
        json!({"input": "hi", "text": large, "metadata": {"m": 1}})
    );
}

#[test]
fn usage_mode_keeps_no_input() {
    let members = RequestMembers::parse(br#"{"input": "hi"}"#, &[], false).unwrap();
    assert!(members.into_input().is_none());
}

#[test]
fn only_a_single_json_object_is_accepted() {
    for body in [&b"[]"[..], b"\"x\"", b"{} {}", b"{\"a\":}", b""] {
        assert!(RequestMembers::parse(body, &[], true).is_err(), "{body:?}");
    }
}
