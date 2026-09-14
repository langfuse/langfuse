//! Incremental SSE framing. A bad or oversized event only affects observation.
#[derive(Default)]
pub(super) struct Sse {
    line: Vec<u8>,
    data: Vec<u8>,
    line_nonempty: bool,
    skip_lf: bool,
    state: EventState,
    pub incomplete: bool,
}

#[derive(Default)]
enum EventState {
    #[default]
    Collecting,
    Discarding,
}

impl Sse {
    pub fn push(&mut self, bytes: &[u8], limit: usize, mut event: impl FnMut(&[u8])) {
        for &byte in bytes {
            if self.skip_lf {
                self.skip_lf = false;
                if byte == b'\n' {
                    continue;
                }
            }
            if byte == b'\r' || byte == b'\n' {
                self.end_line(&mut event);
                self.skip_lf = byte == b'\r';
            } else {
                self.line_nonempty = true;
                if matches!(self.state, EventState::Collecting) {
                    if self.line.len() + self.data.len() >= limit {
                        self.incomplete = true;
                        self.state = EventState::Discarding;
                        self.line.clear();
                        self.data.clear();
                    } else {
                        self.line.push(byte);
                    }
                }
            }
        }
    }

    fn end_line(&mut self, event: &mut impl FnMut(&[u8])) {
        if !self.line_nonempty {
            if matches!(self.state, EventState::Collecting) && !self.data.is_empty() {
                event(&self.data[..self.data.len() - 1]);
            }
            self.data.clear();
            self.state = EventState::Collecting;
        } else if matches!(self.state, EventState::Collecting) {
            let value = self
                .line
                .strip_prefix(b"data:")
                .map(|value| value.strip_prefix(b" ").unwrap_or(value));
            if let Some(value) = value {
                self.data.extend_from_slice(value);
                self.data.push(b'\n');
            } else if self.line == b"data" {
                self.data.push(b'\n');
            }
        }
        self.line.clear();
        self.line_nonempty = false;
    }

    pub fn finish(&self) -> bool {
        !self.incomplete
            && !self.line_nonempty
            && self.data.is_empty()
            && matches!(self.state, EventState::Collecting)
    }
}
