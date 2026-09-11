use std::{net::TcpListener, process::Command};

#[test]
fn invalid_configuration_exits_without_disclosing_the_value() {
    // Occupy the listener so an ignored setting cannot leave a child server running.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    for name in [
        "LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS",
        "LANGFUSE_LOG_LEVEL",
        "LANGFUSE_LOG_FORMAT",
        "LANGFUSE_AI_GATEWAY_WEB_URL",
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

#[test]
fn lifecycle_logs_follow_the_shared_format() {
    use std::{
        io::{BufRead, BufReader},
        process::Stdio,
        sync::mpsc,
        time::Duration,
    };

    for format in [None, Some("text"), Some("json")] {
        let mut command = Command::new(env!("CARGO_BIN_EXE_ai-gateway"));
        command
            .env_clear()
            .env("LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS", "127.0.0.1:0")
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        if let Some(format) = format {
            command.env("LANGFUSE_LOG_FORMAT", format);
        }
        let mut child = command.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (sender, receiver) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            let mut line = String::new();
            let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
            let _ = sender.send(result);
        });
        let result = receiver.recv_timeout(Duration::from_secs(10));
        let _ = child.kill();
        child.wait().unwrap();
        reader.join().unwrap();
        let line = result.expect("gateway must emit a startup log").unwrap();
        assert!(line.contains("gateway listening"), "{format:?}: {line}");
        assert!(
            !line.contains('\u{1b}'),
            "logs must not contain ANSI escapes: {line}"
        );
        if format == Some("json") {
            assert!(
                line.starts_with('{') && line.trim_end().ends_with('}'),
                "{line}"
            );
            assert!(line.contains("\"level\":\"INFO\""), "{line}");
            assert!(line.contains("\"address\":\"127.0.0.1:"), "{line}");
        } else {
            assert!(!line.starts_with('{'), "{line}");
            assert!(
                line.contains("INFO") && line.contains("address=127.0.0.1:"),
                "{line}"
            );
        }
    }
}
