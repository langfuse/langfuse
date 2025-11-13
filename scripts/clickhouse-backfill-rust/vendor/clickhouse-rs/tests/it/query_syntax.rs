#[tokio::test]
async fn query_with_tail_comment() {
    let client = prepare_database!();
    let value = client
        .query("SELECT 1 \n --comment")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_head_comment() {
    let client = prepare_database!();
    let value = client
        .query("--comment\nSELECT 1")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_head_and_tail_comment() {
    let client = prepare_database!();
    let value = client
        .query("--comment\nSELECT 1\n--comment")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_mid_comment() {
    let client = prepare_database!();
    let value = client
        .query("SELECT \n--comment\n 1")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_comment_multiline() {
    let client = prepare_database!();
    let value = client
        .query("SELECT *\nFROM system.numbers\n/* This is:\na multiline comment\n*/\nLIMIT 3")
        .fetch_all::<u64>()
        .await
        .unwrap();
    assert_eq!(value, [0, 1, 2]);
}

#[tokio::test]
async fn query_with_comment_utf8() {
    let client = prepare_database!();
    let value = client
        .query("SELECT * FROM system.numbers LIMIT 3 -- проверка данных 测试 ;;;;;")
        .fetch_all::<u64>()
        .await
        .unwrap();
    assert_eq!(value, [0, 1, 2]);
}

#[tokio::test]
async fn query_with_comment_multiline_unterminated() {
    let client = prepare_database!();
    let value = client
        .query("SELECT '/* unterminated' AS s")
        .fetch_one::<String>()
        .await
        .unwrap();
    assert_eq!(value, "/* unterminated");
}

#[tokio::test]
async fn query_with_comment_syntax() {
    let client = prepare_database!();
    let value = client
        .query("SELECT '-- not a comment /* not a comment */'")
        .fetch_one::<String>()
        .await
        .unwrap();
    assert_eq!(value, "-- not a comment /* not a comment */");
}

#[tokio::test]
async fn query_with_comment_combined() {
    let client = prepare_database!();
    let value = client
        .query("--comment\nSELECT *\n--comment\n/*\nпроверка\t;;\r\n;;\n*/\nFROM (select 1)\n;")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_semicolon() {
    let client = prepare_database!();
    let value = client
        .query("SELECT * FROM system.numbers LIMIT 3;")
        .fetch_all::<u64>()
        .await
        .unwrap();
    assert_eq!(value, [0, 1, 2]);
}

#[tokio::test]
async fn query_with_semicolon_trailing() {
    let client = prepare_database!();
    let value = client
        .query("SELECT * FROM system.numbers LIMIT 3;;;;;;;;;;;;;;;;;")
        .fetch_all::<u64>()
        .await
        .unwrap();
    assert_eq!(value, [0, 1, 2]);
}

#[tokio::test]
async fn query_with_semicolon_in_comment() {
    let client = prepare_database!();
    let value = client
        .query("SELECT * FROM system.numbers LIMIT 3 -- comment with ;;")
        .fetch_all::<u64>()
        .await
        .unwrap();
    assert_eq!(value, [0, 1, 2]);
}

#[tokio::test]
async fn query_with_semicolon_in_multiline_comment() {
    let client = prepare_database!();
    let value = client
        .query("SELECT * FROM system.numbers LIMIT 3 /*\n * comment with --\n * and ; inside\n*/")
        .fetch_all::<u64>()
        .await
        .unwrap();
    assert_eq!(value, [0, 1, 2]);
}

#[tokio::test]
async fn query_with_semicolon_allowed() {
    let client = prepare_database!();
    let value = client
        .query("SELECT ';;';;")
        .fetch_one::<String>()
        .await
        .unwrap();
    assert_eq!(value, ";;");
}

#[tokio::test]
async fn query_with_tail_newline() {
    let client = prepare_database!();
    let value = client.query("SELECT 1\n").fetch_one::<u8>().await.unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_tail_space() {
    let client = prepare_database!();
    let value = client.query("SELECT 1 ").fetch_one::<u8>().await.unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_tail_tab() {
    let client = prepare_database!();
    let value = client.query("SELECT 1\t").fetch_one::<u8>().await.unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_tail_carriage_return() {
    let client = prepare_database!();
    let value = client.query("SELECT 1\r").fetch_one::<u8>().await.unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_tail_carriage_return_newline() {
    let client = prepare_database!();
    let value = client
        .query("SELECT 1\r\n")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_tail_carriage_return_space() {
    let client = prepare_database!();
    let value = client.query("SELECT 1\r ").fetch_one::<u8>().await.unwrap();
    assert_eq!(value, 1);
}

#[tokio::test]
async fn query_with_readonly_user() {
    let database = test_database_name!();

    let client = crate::_priv::prepare_database(&database).await;

    let client = crate::create_readonly_user(&client, &database).await;

    let value = client
        .query("--comment\nSELECT *\n--comment\n/*\nпроверка\t;;\r\n;;\n*/\nFROM (select 1)\n;")
        .fetch_one::<u8>()
        .await
        .unwrap();
    assert_eq!(value, 1);
}
