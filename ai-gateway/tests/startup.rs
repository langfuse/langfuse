use std::{net::TcpListener, process::Command};

#[test]
fn invalid_configuration_exits_without_disclosing_the_value() {
    // Occupy the listener so an ignored setting cannot leave a child server running.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    for name in [
        "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS",
        "LANGFUSE_LOG_LEVEL",
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_ai-gateway"))
            .env_clear()
            .env(
                "LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS",
                listener.local_addr().unwrap().to_string(),
            )
            .env(name, "example-sensitive-value")
            .output()
            .unwrap();
        assert!(!output.status.success());
        let error = String::from_utf8(output.stderr).unwrap();
        assert!(error.contains(name), "{error}");
        assert!(!error.contains("example-sensitive-value"));
        assert!(output.stdout.is_empty());
    }
}

#[test]
fn occupied_listener_exits_unsuccessfully() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_ai-gateway"))
        .env_clear()
        .env(
            "LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS",
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
