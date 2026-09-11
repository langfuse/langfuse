use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use std::fmt::Write;

pub(super) fn authorization(service_key: &str, gateway_key: &str, timestamp: u64) -> String {
    let key_hash = lowercase_hex(&Sha256::digest(gateway_key.as_bytes()));
    let payload = format!("gateway-web-v1\n{timestamp}\n{key_hash}");
    // HMAC accepts keys of any length.
    let mut mac = Hmac::<Sha256>::new_from_slice(service_key.as_bytes()).expect("valid HMAC key");
    mac.update(payload.as_bytes());
    let signature = lowercase_hex(&mac.finalize().into_bytes());
    format!("HMAC timestamp={timestamp},signature={signature}")
}

fn lowercase_hex(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(encoded, "{byte:02x}").expect("writing to String cannot fail");
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_web_v1_fixture() {
        assert_eq!(
            authorization(
                "gateway-web-test-secret-not-for-production",
                "gw_test_alice",
                1_800_000_000
            ),
            "HMAC timestamp=1800000000,signature=e104b6baa50d9b766b036e27876683aa1f4bff7f31bb6af66dce6b636a53b2bd"
        );
    }
}
