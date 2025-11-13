use crate::{Authentication, ProductInfo};
use hyper::header::{AUTHORIZATION, USER_AGENT};
use hyper::http::request::Builder;
use std::collections::HashMap;
use std::env::consts::OS;

fn get_user_agent(products_info: &[ProductInfo]) -> String {
    // See https://doc.rust-lang.org/cargo/reference/environment-variables.html#environment-variables-cargo-sets-for-crates
    let pkg_ver = option_env!("CARGO_PKG_VERSION").unwrap_or("unknown");
    let rust_ver = option_env!("CARGO_PKG_RUST_VERSION").unwrap_or("unknown");
    let default_agent = format!("clickhouse-rs/{pkg_ver} (lv:rust/{rust_ver}, os:{OS})");
    if products_info.is_empty() {
        default_agent
    } else {
        let products = products_info
            .iter()
            .rev()
            .map(|product_info| product_info.to_string())
            .collect::<Vec<String>>()
            .join(" ");
        format!("{products} {default_agent}")
    }
}

#[inline]
pub(crate) fn with_request_headers(
    mut builder: Builder,
    headers: &HashMap<String, String>,
    products_info: &[ProductInfo],
) -> Builder {
    for (name, value) in headers {
        builder = builder.header(name, value);
    }
    builder = builder.header(USER_AGENT.to_string(), get_user_agent(products_info));
    builder
}

#[inline]
pub(crate) fn with_authentication(mut builder: Builder, auth: &Authentication) -> Builder {
    match auth {
        Authentication::Jwt { access_token } => {
            let bearer = format!("Bearer {access_token}");
            builder = builder.header(AUTHORIZATION, bearer);
        }
        Authentication::Credentials { user, password } => {
            if let Some(user) = &user {
                builder = builder.header("X-ClickHouse-User", user);
            }
            if let Some(password) = &password {
                builder = builder.header("X-ClickHouse-Key", password);
            }
        }
    }
    builder
}
