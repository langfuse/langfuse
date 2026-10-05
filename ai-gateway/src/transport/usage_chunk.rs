//! Removes the usage-only Chat Completions chunk the gateway requested on the
//! caller's behalf. Every other byte is relayed unchanged and in order.
use axum::body::Bytes;
use serde_json::Value;

/// Events are held only until their blank line; the usage chunk is small, so a
/// larger event is relayed as it arrives instead of being buffered.
const MAX_BUFFERED_EVENT: usize = 64 * 1024;

#[derive(Default)]
pub(crate) struct UsageChunkFilter {
    event: Vec<u8>,
    line_len: usize,
    skip_lf: bool,
    /// Whether the event just ended on `\r` was relayed; its `\n` follows it.
    event_lf: Option<bool>,
    passthrough: bool,
}

impl UsageChunkFilter {
    pub fn filter_chunk(&mut self, chunk: &[u8]) -> Bytes {
        let mut relayed = Vec::with_capacity(chunk.len());
        for &byte in chunk {
            if std::mem::take(&mut self.skip_lf) && byte == b'\n' {
                match self.event_lf.take() {
                    Some(true) => relayed.push(byte),
                    Some(false) => {}
                    None => self.keep(byte, &mut relayed),
                }
                continue;
            }
            self.event_lf = None;
            self.keep(byte, &mut relayed);
            if byte == b'\r' || byte == b'\n' {
                self.skip_lf = byte == b'\r';
                if self.line_len == 0 {
                    self.end_event(&mut relayed);
                }
                self.line_len = 0;
            } else {
                self.line_len += 1;
            }
        }
        Bytes::from(relayed)
    }

    /// Bytes of an event the upstream never terminated, unless it is the usage chunk.
    pub fn finish(&mut self) -> Bytes {
        let event = std::mem::take(&mut self.event);
        if self.passthrough || !is_usage_chunk(&event) {
            Bytes::from(event)
        } else {
            Bytes::new()
        }
    }

    fn keep(&mut self, byte: u8, relayed: &mut Vec<u8>) {
        if self.passthrough {
            relayed.push(byte);
        } else if self.event.len() >= MAX_BUFFERED_EVENT {
            relayed.append(&mut self.event);
            relayed.push(byte);
            self.passthrough = true;
        } else {
            self.event.push(byte);
        }
    }

    fn end_event(&mut self, relayed: &mut Vec<u8>) {
        let kept = std::mem::take(&mut self.passthrough) || !is_usage_chunk(&self.event);
        if kept {
            relayed.append(&mut self.event);
        } else {
            self.event.clear();
        }
        self.event_lf = self.skip_lf.then_some(kept);
    }
}

fn is_usage_chunk(event: &[u8]) -> bool {
    let mut data = Vec::new();
    for line in event.split(|byte| *byte == b'\n' || *byte == b'\r') {
        if let Some(value) = line.strip_prefix(b"data:") {
            if !data.is_empty() {
                data.push(b'\n');
            }
            data.extend_from_slice(value.strip_prefix(b" ").unwrap_or(value));
        }
    }
    let Ok(Value::Object(chunk)) = serde_json::from_slice(&data) else {
        return false;
    };
    chunk
        .get("choices")
        .and_then(Value::as_array)
        .is_some_and(Vec::is_empty)
        && chunk.get("usage").is_some_and(Value::is_object)
}

#[cfg(test)]
mod tests {
    use super::*;

    const USAGE: &str = "data: {\"id\":\"c\",\"choices\":[],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":2,\"total_tokens\":3}}";

    fn relay_in_pieces(input: &str, piece: usize) -> String {
        let mut filter = UsageChunkFilter::default();
        let mut relayed = Vec::new();
        for chunk in input.as_bytes().chunks(piece) {
            relayed.extend_from_slice(&filter.filter_chunk(chunk));
        }
        relayed.extend_from_slice(&filter.finish());
        String::from_utf8(relayed).unwrap()
    }

    #[test]
    fn drops_only_the_usage_chunk_for_every_line_ending_and_chunk_split() {
        for newline in ["\n", "\r\n", "\r"] {
            let content = format!(
                "data: {{\"choices\":[{{\"index\":0,\"delta\":{{\"content\":\"hi\"}}}}],\"usage\":null}}{newline}{newline}"
            );
            let done = format!(": keepalive{newline}{newline}data: [DONE]{newline}{newline}");
            let input = format!("{content}{USAGE}{newline}{newline}{done}");
            for piece in [1, 2, 7, input.len()] {
                assert_eq!(
                    relay_in_pieces(&input, piece),
                    format!("{content}{done}"),
                    "{newline:?} in {piece}-byte pieces"
                );
            }
        }
    }

    #[test]
    fn keeps_chunks_with_choices_errors_and_unterminated_tails() {
        let input = concat!(
            "data: {\"choices\":[{\"index\":0,\"delta\":{}}],\"usage\":{\"total_tokens\":3}}\n\n",
            "data: {\"choices\":[],\"usage\":null}\n\n",
            "data: {\"error\":{\"message\":\"failed\"}}\n\n",
            "data: not json\n\n",
            "data: {\"choices\":[],\"usage\":{\"tota",
        );
        assert_eq!(relay_in_pieces(input, 5), input);
    }

    #[test]
    fn an_unterminated_usage_chunk_at_eof_stays_hidden() {
        for tail in [USAGE.to_owned(), format!("{USAGE}\n")] {
            let input = format!("data: [DONE]\n\n{tail}");
            assert_eq!(relay_in_pieces(&input, 3), "data: [DONE]\n\n", "{tail:?}");
        }
    }

    #[test]
    fn large_events_are_relayed_without_waiting_for_their_end() {
        let mut filter = UsageChunkFilter::default();
        let large = format!("data: {}", "x".repeat(MAX_BUFFERED_EVENT + 10));
        let relayed = filter.filter_chunk(large.as_bytes());
        assert_eq!(relayed, large.as_bytes());
        assert_eq!(filter.filter_chunk(b"\n\n"), "\n\n".as_bytes());
        let tail = format!("{USAGE}\n\ndata: [DONE]\n\n");
        assert_eq!(
            filter.filter_chunk(tail.as_bytes()),
            "data: [DONE]\n\n".as_bytes()
        );
    }
}
