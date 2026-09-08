use std::{net::TcpListener, process::Command};

#[test]
fn invalid_configuration_exits_without_disclosing_the_value() {
    let output = Command::new(env!("CARGO_BIN_EXE_ai-gateway"))
        .env_clear()
        .env(
            "AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS",
            "example-sensitive-value",
        )
        .output()
        .unwrap();
    assert!(!output.status.success());
    let error = String::from_utf8(output.stderr).unwrap();
    assert!(error.contains("AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS"));
    assert!(!error.contains("example-sensitive-value"));
    assert!(output.stdout.is_empty());
}

#[test]
fn occupied_listener_exits_unsuccessfully() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_ai-gateway"))
        .env_clear()
        .env(
            "AI_GATEWAY_LISTEN_ADDRESS",
            listener.local_addr().unwrap().to_string(),
        )
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(
        String::from_utf8(output.stderr)
            .unwrap()
            .contains("gateway startup or shutdown failed")
    );
}
