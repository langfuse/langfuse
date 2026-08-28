use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow, bail};
use bytes::Bytes;
use serde_json::{Value, json};

pub struct TranslatedRequest {
    pub body: Bytes,
    pub model: String,
    pub stream: bool,
}

pub fn openai_request_to_anthropic(input: &[u8]) -> Result<TranslatedRequest> {
    let request: Value = serde_json::from_slice(input).context("request body must be JSON")?;
    let object = request
        .as_object()
        .ok_or_else(|| anyhow!("request body must be a JSON object"))?;

    let model = required_string(object.get("model"), "model")?;
    let stream = object
        .get("stream")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let max_tokens = object
        .get("max_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(1024);
    let messages = object
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("messages must be an array"))?;
    if messages.is_empty() {
        bail!("messages must be a non-empty array");
    }

    let mut system_blocks = Vec::new();
    let mut anthropic_messages: Vec<Value> = Vec::new();
    for message in messages {
        let message = message
            .as_object()
            .ok_or_else(|| anyhow!("each message must be an object"))?;
        let role = required_string(message.get("role"), "message.role")?;
        if role == "system" || role == "developer" {
            let content = message
                .get("content")
                .ok_or_else(|| anyhow!("message.content is required"))?;
            for block in openai_content_to_anthropic(content, false)? {
                if block.get("text").and_then(Value::as_str).is_none() {
                    bail!("system and developer messages may only contain text");
                }
                system_blocks.push(block);
            }
            continue;
        }

        let (anthropic_role, blocks) = match role {
            "user" => {
                let content = message
                    .get("content")
                    .ok_or_else(|| anyhow!("message.content is required"))?;
                ("user", openai_content_to_anthropic(content, true)?)
            }
            "assistant" => {
                let mut blocks = match message.get("content") {
                    Some(Value::Null) | None => Vec::new(),
                    Some(content) => openai_content_to_anthropic(content, true)?,
                };
                if let Some(tool_calls) = message.get("tool_calls") {
                    blocks.extend(openai_tool_calls_to_anthropic(tool_calls)?);
                }
                if blocks.is_empty() {
                    bail!("assistant message must contain content or tool_calls");
                }
                ("assistant", blocks)
            }
            "tool" => ("user", vec![openai_tool_result_to_anthropic(message)?]),
            _ => bail!("unsupported message role: {role}"),
        };
        if let Some(previous) = anthropic_messages.last_mut()
            && previous.get("role").and_then(Value::as_str) == Some(anthropic_role)
        {
            previous
                .get_mut("content")
                .and_then(Value::as_array_mut)
                .expect("translated message content is always an array")
                .extend(blocks);
        } else {
            anthropic_messages.push(json!({
                "role": anthropic_role,
                "content": blocks,
            }));
        }
    }
    if anthropic_messages.is_empty() {
        bail!("at least one user or assistant message is required");
    }

    let mut translated = serde_json::Map::new();
    translated.insert("model".to_owned(), Value::String(model.to_owned()));
    translated.insert("max_tokens".to_owned(), Value::from(max_tokens));
    translated.insert("stream".to_owned(), Value::Bool(stream));
    translated.insert("messages".to_owned(), Value::Array(anthropic_messages));
    if !system_blocks.is_empty() {
        translated.insert("system".to_owned(), Value::Array(system_blocks));
    }
    copy_optional_number(object, &mut translated, "temperature")?;
    copy_optional_number(object, &mut translated, "top_p")?;
    if let Some(stop) = object.get("stop") {
        translated.insert("stop_sequences".to_owned(), translate_stop_sequences(stop)?);
    }

    let tool_choice = object
        .get("tool_choice")
        .map(translate_tool_choice)
        .transpose()?
        .flatten();
    let tools_disabled = object.get("tool_choice").and_then(Value::as_str) == Some("none");
    if !tools_disabled {
        if let Some(tools) = object.get("tools") {
            translated.insert("tools".to_owned(), translate_tools(tools)?);
        }
        if let Some(tool_choice) = tool_choice {
            translated.insert("tool_choice".to_owned(), tool_choice);
        }
    }

    Ok(TranslatedRequest {
        body: Bytes::from(serde_json::to_vec(&Value::Object(translated))?),
        model: model.to_owned(),
        stream,
    })
}

fn openai_tool_calls_to_anthropic(tool_calls: &Value) -> Result<Vec<Value>> {
    tool_calls
        .as_array()
        .ok_or_else(|| anyhow!("assistant.tool_calls must be an array"))?
        .iter()
        .map(|tool_call| {
            let tool_call = tool_call
                .as_object()
                .ok_or_else(|| anyhow!("each assistant tool_call must be an object"))?;
            if required_string(tool_call.get("type"), "tool_call.type")? != "function" {
                bail!("only function tool_calls are supported");
            }
            let function = tool_call
                .get("function")
                .and_then(Value::as_object)
                .ok_or_else(|| anyhow!("tool_call.function must be an object"))?;
            let arguments =
                required_string(function.get("arguments"), "tool_call.function.arguments")?;
            let input: Value = serde_json::from_str(arguments)
                .context("tool_call.function.arguments must be JSON")?;
            if !input.is_object() {
                bail!("tool_call.function.arguments must encode a JSON object");
            }
            Ok(json!({
                "type": "tool_use",
                "id": required_string(tool_call.get("id"), "tool_call.id")?,
                "name": required_string(function.get("name"), "tool_call.function.name")?,
                "input": input,
            }))
        })
        .collect()
}

fn openai_tool_result_to_anthropic(message: &serde_json::Map<String, Value>) -> Result<Value> {
    let content = message
        .get("content")
        .ok_or_else(|| anyhow!("message.content is required"))?;
    Ok(json!({
        "type": "tool_result",
        "tool_use_id": required_string(message.get("tool_call_id"), "message.tool_call_id")?,
        "content": openai_content_to_anthropic(content, true)?,
    }))
}

fn translate_tools(tools: &Value) -> Result<Value> {
    let tools = tools
        .as_array()
        .ok_or_else(|| anyhow!("tools must be an array"))?;
    let translated = tools
        .iter()
        .map(|tool| {
            let tool = tool
                .as_object()
                .ok_or_else(|| anyhow!("each tool must be an object"))?;
            if required_string(tool.get("type"), "tool.type")? != "function" {
                bail!("only function tools are supported");
            }
            let function = tool
                .get("function")
                .and_then(Value::as_object)
                .ok_or_else(|| anyhow!("tool.function must be an object"))?;
            let mut translated = serde_json::Map::new();
            translated.insert(
                "name".to_owned(),
                Value::String(
                    required_string(function.get("name"), "tool.function.name")?.to_owned(),
                ),
            );
            if let Some(description) = function.get("description") {
                translated.insert(
                    "description".to_owned(),
                    Value::String(
                        required_string(Some(description), "tool.function.description")?.to_owned(),
                    ),
                );
            }
            let input_schema = function
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
            if !input_schema.is_object() {
                bail!("tool.function.parameters must be an object");
            }
            translated.insert("input_schema".to_owned(), input_schema);
            Ok(Value::Object(translated))
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Value::Array(translated))
}

fn translate_tool_choice(tool_choice: &Value) -> Result<Option<Value>> {
    match tool_choice {
        Value::String(value) => match value.as_str() {
            "auto" => Ok(Some(json!({ "type": "auto" }))),
            "required" => Ok(Some(json!({ "type": "any" }))),
            "none" => Ok(None),
            _ => bail!("unsupported tool_choice: {value}"),
        },
        Value::Object(choice) => {
            if required_string(choice.get("type"), "tool_choice.type")? != "function" {
                bail!("only function tool_choice objects are supported");
            }
            let function = choice
                .get("function")
                .and_then(Value::as_object)
                .ok_or_else(|| anyhow!("tool_choice.function must be an object"))?;
            Ok(Some(json!({
                "type": "tool",
                "name": required_string(function.get("name"), "tool_choice.function.name")?,
            })))
        }
        _ => bail!("tool_choice must be a string or object"),
    }
}

fn translate_stop_sequences(stop: &Value) -> Result<Value> {
    let values = match stop {
        Value::String(value) if !value.is_empty() => vec![Value::String(value.to_owned())],
        Value::Array(values) => values
            .iter()
            .map(|value| {
                required_string(Some(value), "stop sequence")
                    .map(|value| Value::String(value.to_owned()))
            })
            .collect::<Result<Vec<_>>>()?,
        _ => bail!("stop must be a non-empty string or an array of non-empty strings"),
    };
    Ok(Value::Array(values))
}

fn copy_optional_number(
    source: &serde_json::Map<String, Value>,
    target: &mut serde_json::Map<String, Value>,
    name: &str,
) -> Result<()> {
    if let Some(value) = source.get(name) {
        if !value.is_number() {
            bail!("{name} must be a number");
        }
        target.insert(name.to_owned(), value.clone());
    }
    Ok(())
}

fn openai_content_to_anthropic(content: &Value, allow_images: bool) -> Result<Vec<Value>> {
    match content {
        Value::String(text) => Ok(vec![json!({ "type": "text", "text": text })]),
        Value::Array(parts) => parts
            .iter()
            .map(|part| translate_content_part(part, allow_images))
            .collect(),
        _ => bail!("message.content must be a string or array"),
    }
}

fn translate_content_part(part: &Value, allow_images: bool) -> Result<Value> {
    let part = part
        .as_object()
        .ok_or_else(|| anyhow!("content parts must be objects"))?;
    match required_string(part.get("type"), "content.type")? {
        "text" => Ok(json!({
            "type": "text",
            "text": required_string(part.get("text"), "content.text")?,
        })),
        "image_url" if allow_images => {
            let url = part
                .get("image_url")
                .and_then(Value::as_object)
                .and_then(|image| image.get("url"))
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow!("content.image_url.url must be a string"))?;
            let (media_type, data) = parse_data_url(url)?;
            Ok(json!({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": data,
                }
            }))
        }
        "image_url" => bail!("images are only supported in user messages"),
        part_type => bail!("unsupported content type: {part_type}"),
    }
}

fn parse_data_url(url: &str) -> Result<(String, String)> {
    let value = url
        .strip_prefix("data:")
        .ok_or_else(|| anyhow!("only data URL images are supported"))?;
    let (metadata, data) = value
        .split_once(',')
        .ok_or_else(|| anyhow!("invalid data URL"))?;
    let media_type = metadata
        .strip_suffix(";base64")
        .ok_or_else(|| anyhow!("image data URL must use base64"))?;
    if media_type.is_empty() || data.is_empty() {
        bail!("invalid image data URL");
    }
    if !data.bytes().all(|value| {
        value.is_ascii_alphanumeric()
            || matches!(value, b'+' | b'/' | b'=')
            || value.is_ascii_whitespace()
    }) {
        bail!("image data URL contains invalid base64 characters");
    }
    Ok((
        media_type.to_owned(),
        data.chars()
            .filter(|value| !value.is_whitespace())
            .collect(),
    ))
}

fn required_string<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a str> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("{name} must be a non-empty string"))
}

pub fn anthropic_response_to_openai(input: &[u8]) -> Result<Bytes> {
    let response: Value =
        serde_json::from_slice(input).context("upstream response must be JSON")?;
    let model = response
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let id = response
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("message");
    let content = response
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let text = content
        .iter()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect::<String>();
    let tool_calls = content
        .iter()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("tool_use"))
        .map(|block| {
            Ok(json!({
                "id": required_string(block.get("id"), "content.id")?,
                "type": "function",
                "function": {
                    "name": required_string(block.get("name"), "content.name")?,
                    "arguments": serde_json::to_string(
                        block.get("input").unwrap_or(&Value::Object(serde_json::Map::new()))
                    )?,
                }
            }))
        })
        .collect::<Result<Vec<_>>>()?;
    let finish_reason = map_finish_reason(
        response
            .get("stop_reason")
            .and_then(Value::as_str)
            .unwrap_or("end_turn"),
    );
    let input_tokens = response
        .pointer("/usage/input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output_tokens = response
        .pointer("/usage/output_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);

    let mut message = json!({ "role": "assistant", "content": text });
    if !tool_calls.is_empty() {
        message
            .as_object_mut()
            .expect("OpenAI message is always an object")
            .insert("tool_calls".to_owned(), Value::Array(tool_calls));
    }

    Ok(Bytes::from(serde_json::to_vec(&json!({
        "id": id,
        "object": "chat.completion",
        "created": unix_seconds(),
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason,
        }],
        "usage": {
            "prompt_tokens": input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }
    }))?))
}

pub struct AnthropicSseTranslator {
    decoder: SseDecoder,
    created: u64,
    id: Option<String>,
    model: Option<String>,
    input_tokens: u64,
    tool_indices: HashMap<u64, u64>,
    next_tool_index: u64,
    sent_finish: bool,
    sent_done: bool,
}

impl Default for AnthropicSseTranslator {
    fn default() -> Self {
        Self {
            decoder: SseDecoder::default(),
            created: unix_seconds(),
            id: None,
            model: None,
            input_tokens: 0,
            tool_indices: HashMap::new(),
            next_tool_index: 0,
            sent_finish: false,
            sent_done: false,
        }
    }
}

impl AnthropicSseTranslator {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<Bytes>> {
        self.decoder.push(chunk);
        let events = self.decoder.take_events();
        let mut output = Vec::new();
        for event in events {
            output.extend(self.translate_event(&event)?);
        }
        Ok(output)
    }

    pub fn finish(&mut self) -> Result<Vec<Bytes>> {
        if !self.decoder.remaining_is_whitespace() {
            bail!("upstream ended with an incomplete SSE event");
        }
        if self.sent_done {
            Ok(Vec::new())
        } else {
            self.sent_done = true;
            Ok(vec![Bytes::from_static(b"data: [DONE]\n\n")])
        }
    }

    fn translate_event(&mut self, event: &[u8]) -> Result<Vec<Bytes>> {
        let Some(data) = sse_data(event)? else {
            return Ok(Vec::new());
        };
        if data == "[DONE]" {
            self.sent_done = true;
            return Ok(vec![Bytes::from_static(b"data: [DONE]\n\n")]);
        }
        let event: Value = serde_json::from_str(&data).context("invalid Anthropic SSE JSON")?;
        let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");

        let chunk = match event_type {
            "message_start" => {
                self.id = event
                    .pointer("/message/id")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                self.model = event
                    .pointer("/message/model")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                self.input_tokens = event
                    .pointer("/message/usage/input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                Some(self.openai_chunk(
                    json!({ "role": "assistant", "content": "" }),
                    Value::Null,
                    None,
                ))
            }
            "content_block_start" => match event
                .pointer("/content_block/type")
                .and_then(Value::as_str)
            {
                Some("text") => event
                    .pointer("/content_block/text")
                    .and_then(Value::as_str)
                    .filter(|text| !text.is_empty())
                    .map(|text| self.openai_chunk(json!({ "content": text }), Value::Null, None)),
                Some("tool_use") => {
                    let content_index = event
                        .get("index")
                        .and_then(Value::as_u64)
                        .ok_or_else(|| anyhow!("tool_use content_block_start requires an index"))?;
                    let tool_index = self.tool_index(content_index);
                    let id =
                        required_string(event.pointer("/content_block/id"), "content_block.id")?;
                    let name = required_string(
                        event.pointer("/content_block/name"),
                        "content_block.name",
                    )?;
                    Some(self.openai_chunk(
                        json!({
                            "tool_calls": [{
                                "index": tool_index,
                                "id": id,
                                "type": "function",
                                "function": { "name": name, "arguments": "" },
                            }]
                        }),
                        Value::Null,
                        None,
                    ))
                }
                _ => None,
            },
            "content_block_delta" => match event.pointer("/delta/type").and_then(Value::as_str) {
                Some("text_delta") => event
                    .pointer("/delta/text")
                    .and_then(Value::as_str)
                    .map(|text| self.openai_chunk(json!({ "content": text }), Value::Null, None)),
                Some("input_json_delta") => {
                    let content_index = event
                        .get("index")
                        .and_then(Value::as_u64)
                        .ok_or_else(|| anyhow!("input_json_delta requires a content index"))?;
                    let tool_index = self.tool_index(content_index);
                    let partial_json = event
                        .pointer("/delta/partial_json")
                        .and_then(Value::as_str)
                        .ok_or_else(|| anyhow!("input_json_delta.partial_json must be a string"))?;
                    Some(self.openai_chunk(
                        json!({
                            "tool_calls": [{
                                "index": tool_index,
                                "function": { "arguments": partial_json },
                            }]
                        }),
                        Value::Null,
                        None,
                    ))
                }
                // Extended-thinking and signature deltas are intentionally not
                // exposed as assistant text in the OpenAI-compatible stream.
                _ => None,
            },
            "message_delta" => {
                let stop_reason = event.pointer("/delta/stop_reason").and_then(Value::as_str);
                let output_tokens = event
                    .pointer("/usage/output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let mut chunks = Vec::with_capacity(2);
                if let Some(stop_reason) = stop_reason {
                    self.sent_finish = true;
                    chunks.push(self.openai_chunk(
                        json!({}),
                        Value::String(map_finish_reason(stop_reason)),
                        None,
                    )?);
                }
                chunks.push(self.openai_usage_chunk(output_tokens)?);
                return Ok(chunks);
            }
            "message_stop" if !self.sent_done => {
                self.sent_done = true;
                let mut chunks = Vec::new();
                if !self.sent_finish {
                    chunks.push(self.openai_chunk(
                        json!({}),
                        Value::String("stop".to_owned()),
                        None,
                    )?);
                }
                chunks.push(Bytes::from_static(b"data: [DONE]\n\n"));
                return Ok(chunks);
            }
            "error" => {
                let message = event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Anthropic stream returned an error");
                bail!("{message}");
            }
            _ => None,
        };

        chunk.transpose().map(|chunk| chunk.into_iter().collect())
    }

    fn openai_chunk(
        &self,
        delta: Value,
        finish_reason: Value,
        usage: Option<Value>,
    ) -> Result<Bytes> {
        let mut value = json!({
            "id": self.id.as_deref().unwrap_or("message"),
            "object": "chat.completion.chunk",
            "created": self.created,
            "model": self.model.as_deref().unwrap_or("unknown"),
            "choices": [{
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }]
        });
        if let Some(usage) = usage {
            value
                .as_object_mut()
                .expect("OpenAI chunk is always an object")
                .insert("usage".to_owned(), usage);
        }
        let mut bytes = Vec::from(&b"data: "[..]);
        serde_json::to_writer(&mut bytes, &value)?;
        bytes.extend_from_slice(b"\n\n");
        Ok(Bytes::from(bytes))
    }

    fn openai_usage_chunk(&self, output_tokens: u64) -> Result<Bytes> {
        let value = json!({
            "id": self.id.as_deref().unwrap_or("message"),
            "object": "chat.completion.chunk",
            "created": self.created,
            "model": self.model.as_deref().unwrap_or("unknown"),
            "choices": [],
            "usage": {
                "prompt_tokens": self.input_tokens,
                "completion_tokens": output_tokens,
                "total_tokens": self.input_tokens + output_tokens,
            }
        });
        let mut bytes = Vec::from(&b"data: "[..]);
        serde_json::to_writer(&mut bytes, &value)?;
        bytes.extend_from_slice(b"\n\n");
        Ok(Bytes::from(bytes))
    }

    fn tool_index(&mut self, content_index: u64) -> u64 {
        if let Some(index) = self.tool_indices.get(&content_index) {
            return *index;
        }
        let index = self.next_tool_index;
        self.next_tool_index += 1;
        self.tool_indices.insert(content_index, index);
        index
    }
}

fn map_finish_reason(reason: &str) -> String {
    match reason {
        "max_tokens" => "length",
        "tool_use" => "tool_calls",
        _ => "stop",
    }
    .to_owned()
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Default)]
struct SseDecoder {
    buffer: Vec<u8>,
}

impl SseDecoder {
    fn push(&mut self, chunk: &[u8]) {
        self.buffer.extend_from_slice(chunk);
    }

    fn take_events(&mut self) -> Vec<Vec<u8>> {
        let mut events = Vec::new();
        while let Some((index, delimiter_len)) = find_sse_delimiter(&self.buffer) {
            let event = self.buffer[..index].to_vec();
            self.buffer.drain(..index + delimiter_len);
            events.push(event);
        }
        events
    }

    fn remaining_is_whitespace(&self) -> bool {
        self.buffer.iter().all(u8::is_ascii_whitespace)
    }
}

fn find_sse_delimiter(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|window| window == b"\n\n");
    let crlf = buffer.windows(4).position(|window| window == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(left), None) => Some((left, 2)),
        (None, Some(right)) => Some((right, 4)),
        (None, None) => None,
    }
}

fn sse_data(event: &[u8]) -> Result<Option<String>> {
    let event = std::str::from_utf8(event).context("SSE event was not UTF-8")?;
    let data = event
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>();
    if data.is_empty() {
        Ok(None)
    } else {
        Ok(Some(data.join("\n")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_text_and_data_url_image_request() {
        let request = json!({
            "model": "gpt-benchmark",
            "max_tokens": 123,
            "stream": true,
            "messages": [
                { "role": "system", "content": "Be concise" },
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": "What is this?" },
                        {
                            "type": "image_url",
                            "image_url": { "url": "data:image/png;base64,aGVsbG8=" }
                        }
                    ]
                }
            ]
        });

        let translated = openai_request_to_anthropic(&serde_json::to_vec(&request).unwrap())
            .expect("request should translate");
        let body: Value = serde_json::from_slice(&translated.body).unwrap();

        assert!(translated.stream);
        assert_eq!(body.pointer("/system/0/text"), Some(&json!("Be concise")));
        assert_eq!(body["max_tokens"], 123);
        assert_eq!(
            body.pointer("/messages/0/content/1/source/media_type"),
            Some(&json!("image/png"))
        );
        assert_eq!(
            body.pointer("/messages/0/content/1/source/data"),
            Some(&json!("aGVsbG8="))
        );
    }

    #[test]
    fn translates_coding_agent_request() {
        let request = json!({
            "model": "gpt-benchmark",
            "stream": true,
            "max_tokens": 4096,
            "temperature": 0.2,
            "top_p": 0.95,
            "stop": ["<stop>", "<tool-stop>"],
            "tool_choice": "auto",
            "tools": [{
                "type": "function",
                "function": {
                    "name": "read_repository_file",
                    "description": "Read a source file",
                    "parameters": {
                        "type": "object",
                        "properties": { "path": { "type": "string" } },
                        "required": ["path"]
                    }
                }
            }],
            "messages": [
                { "role": "system", "content": "Global instructions" },
                { "role": "developer", "content": "Repository instructions" },
                { "role": "user", "content": "Inspect this file" },
                {
                    "role": "assistant",
                    "content": "I will inspect it.",
                    "tool_calls": [{
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "read_repository_file",
                            "arguments": "{\"path\":\"src/main.rs\"}"
                        }
                    }]
                },
                {
                    "role": "tool",
                    "tool_call_id": "call_1",
                    "content": "fn main() {}"
                }
            ]
        });

        let translated = openai_request_to_anthropic(&serde_json::to_vec(&request).unwrap())
            .expect("coding-agent request should translate");
        let body: Value = serde_json::from_slice(&translated.body).unwrap();

        assert_eq!(
            body.pointer("/system/0/text"),
            Some(&json!("Global instructions"))
        );
        assert_eq!(
            body.pointer("/system/1/text"),
            Some(&json!("Repository instructions"))
        );
        assert_eq!(body.pointer("/messages/1/role"), Some(&json!("assistant")));
        assert_eq!(
            body.pointer("/messages/1/content/1/type"),
            Some(&json!("tool_use"))
        );
        assert_eq!(
            body.pointer("/messages/1/content/1/input/path"),
            Some(&json!("src/main.rs"))
        );
        assert_eq!(body.pointer("/messages/2/role"), Some(&json!("user")));
        assert_eq!(
            body.pointer("/messages/2/content/0/tool_use_id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            body.pointer("/tools/0/input_schema/required/0"),
            Some(&json!("path"))
        );
        assert_eq!(body.pointer("/tool_choice/type"), Some(&json!("auto")));
        assert_eq!(body["temperature"], json!(0.2));
        assert_eq!(body["top_p"], json!(0.95));
        assert_eq!(body["stop_sequences"], json!(["<stop>", "<tool-stop>"]));
    }

    #[test]
    fn translates_named_required_and_disabled_tool_choices() {
        assert_eq!(
            translate_tool_choice(&json!({
                "type": "function",
                "function": { "name": "read_file" }
            }))
            .unwrap(),
            Some(json!({ "type": "tool", "name": "read_file" }))
        );
        assert_eq!(
            translate_tool_choice(&json!("required")).unwrap(),
            Some(json!({ "type": "any" }))
        );
        assert_eq!(translate_tool_choice(&json!("none")).unwrap(), None);
    }

    #[test]
    fn translates_split_anthropic_sse_events() {
        let mut translator = AnthropicSseTranslator::default();
        let first = translator
            .push(
                br#"event: message_start
data: {"type":"message_start","message":{"id":"msg_1","model":"claude-test"}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hel"#,
            )
            .unwrap();
        let second = translator
            .push(
                br#"lo"}}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}

event: message_stop
data: {"type":"message_stop"}

"#,
            )
            .unwrap();

        assert_eq!(first.len(), 1);
        let output = second
            .iter()
            .map(|chunk| std::str::from_utf8(chunk).unwrap())
            .collect::<String>();
        assert!(output.contains("hello"));
        assert!(output.contains("\"finish_reason\":\"stop\""));
        assert!(output.ends_with("data: [DONE]\n\n"));
        assert!(translator.finish().unwrap().is_empty());
    }

    #[test]
    fn translates_streamed_tool_call_and_separate_usage_chunk() {
        let mut translator = AnthropicSseTranslator::default();
        let output = translator
            .push(
                br#"event: message_start
data: {"type":"message_start","message":{"id":"msg_1","model":"claude-test","usage":{"input_tokens":7}}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"private"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"done"}}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"apply_patch","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"path\":"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"src/main.rs\"}"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"signature_delta","signature":"secret"}}

event: ping
data: {"type":"ping"}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}

event: message_stop
data: {"type":"message_stop"}

"#,
            )
            .unwrap();
        let chunks = openai_data_chunks(&output);

        assert_eq!(chunks.len(), 7);
        assert_eq!(
            chunks[2].pointer("/choices/0/delta/tool_calls/0/index"),
            Some(&json!(0))
        );
        assert_eq!(
            chunks[2].pointer("/choices/0/delta/tool_calls/0/function/name"),
            Some(&json!("apply_patch"))
        );
        assert_eq!(
            chunks[3].pointer("/choices/0/delta/tool_calls/0/function/arguments"),
            Some(&json!("{\"path\":"))
        );
        assert_eq!(
            chunks[5].pointer("/choices/0/finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(chunks[6]["choices"], json!([]));
        assert_eq!(chunks[6].pointer("/usage/prompt_tokens"), Some(&json!(7)));
        assert_eq!(
            chunks[6].pointer("/usage/completion_tokens"),
            Some(&json!(3))
        );
        let joined = output
            .iter()
            .map(|chunk| String::from_utf8_lossy(chunk))
            .collect::<String>();
        assert!(!joined.contains("private"));
        assert!(!joined.contains("secret"));
        assert!(joined.ends_with("data: [DONE]\n\n"));
    }

    #[test]
    fn surfaces_anthropic_stream_errors() {
        let error = AnthropicSseTranslator::default()
            .push(
                br#"event: error
data: {"type":"error","error":{"message":"upstream overloaded"}}

"#,
            )
            .unwrap_err();

        assert!(error.to_string().contains("upstream overloaded"));
    }

    #[test]
    fn translates_non_streaming_response() {
        let response = json!({
            "id": "msg_1",
            "model": "claude-test",
            "content": [{ "type": "text", "text": "hello" }],
            "stop_reason": "max_tokens",
            "usage": { "input_tokens": 2, "output_tokens": 3 }
        });

        let translated = anthropic_response_to_openai(&serde_json::to_vec(&response).unwrap())
            .expect("response should translate");
        let body: Value = serde_json::from_slice(&translated).unwrap();
        assert_eq!(
            body.pointer("/choices/0/message/content"),
            Some(&json!("hello"))
        );
        assert_eq!(
            body.pointer("/choices/0/finish_reason"),
            Some(&json!("length"))
        );
        assert_eq!(body.pointer("/usage/total_tokens"), Some(&json!(5)));
    }

    fn openai_data_chunks(chunks: &[Bytes]) -> Vec<Value> {
        chunks
            .iter()
            .filter_map(|chunk| {
                let data = std::str::from_utf8(chunk)
                    .unwrap()
                    .strip_prefix("data: ")?
                    .trim();
                (data != "[DONE]").then(|| serde_json::from_str(data).unwrap())
            })
            .collect()
    }
}
