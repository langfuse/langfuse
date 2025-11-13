use bytes::Bytes;
use clickhouse::{Client, Compression, Row, error::Result};
use clickhouse_types::{Column, DataTypeNode};
use criterion::{Criterion, Throughput, criterion_group, criterion_main};
use futures_util::stream;
use http_body_util::StreamBody;
use hyper::body::{Body, Frame};
use hyper::{Request, Response, body::Incoming};
use serde::Serialize;
use std::convert::Infallible;
use std::hint::black_box;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::{
    future::Future,
    mem,
    time::{Duration, Instant},
};

mod common;

async fn serve(
    request: Request<Incoming>,
    compression: Compression,
    with_validation: bool,
) -> Response<impl Body<Data = Bytes, Error = Infallible>> {
    common::skip_incoming(request).await;

    let bytes = if with_validation {
        let schema = vec![
            Column::new("a".to_string(), DataTypeNode::UInt64),
            Column::new("b".to_string(), DataTypeNode::Int64),
            Column::new("c".to_string(), DataTypeNode::Int32),
            Column::new("d".to_string(), DataTypeNode::UInt32),
            Column::new("e".to_string(), DataTypeNode::UInt64),
            Column::new("f".to_string(), DataTypeNode::UInt32),
            Column::new("g".to_string(), DataTypeNode::UInt64),
            Column::new("h".to_string(), DataTypeNode::Int64),
        ];

        let mut buffer = Vec::new();
        clickhouse_types::put_rbwnat_columns_header(&schema, &mut buffer).unwrap();

        match compression {
            Compression::None => Bytes::from(buffer),
            #[cfg(feature = "lz4")]
            Compression::Lz4 => clickhouse::_priv::lz4_compress(&buffer).unwrap(),
            _ => unreachable!(),
        }
    } else {
        Bytes::new()
    };

    let stream = StreamBody::new(stream::once(async { Ok(Frame::data(bytes)) }));
    Response::new(stream)
}

#[derive(Row, Serialize)]
struct SomeRow {
    a: u64,
    b: i64,
    c: i32,
    d: u32,
    e: u64,
    f: u32,
    g: u64,
    h: i64,
}

impl SomeRow {
    fn sample() -> Self {
        black_box(Self {
            a: 42,
            b: 42,
            c: 42,
            d: 42,
            e: 42,
            f: 42,
            g: 42,
            h: 42,
        })
    }
}

const ADDR: SocketAddr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 6524));

async fn run_insert(
    client: Client,
    iters: u64,
    compression: Compression,
    validation: bool,
) -> Result<Duration> {
    let _server = common::start_server(ADDR, move |req| serve(req, compression, validation)).await;

    let start = Instant::now();
    let mut insert = client.insert::<SomeRow>("table").await?;

    for _ in 0..iters {
        insert.write(&SomeRow::sample()).await?;
    }

    insert.end().await?;
    Ok(start.elapsed())
}

#[cfg(feature = "inserter")]
async fn run_inserter<const WITH_PERIOD: bool>(
    client: Client,
    iters: u64,
    compression: Compression,
    validation: bool,
) -> Result<Duration> {
    let _server = common::start_server(ADDR, move |req| serve(req, compression, validation)).await;

    let start = Instant::now();
    let mut inserter = client.inserter::<SomeRow>("table").with_max_rows(iters);

    if WITH_PERIOD {
        // Just to measure overhead, not to actually use it.
        inserter = inserter.with_period(Some(Duration::from_secs(1000)));
    }

    for _ in 0..iters {
        inserter.write(&SomeRow::sample()).await?;
        inserter.commit().await?;
    }

    inserter.end().await?;
    Ok(start.elapsed())
}

fn run<F>(c: &mut Criterion, name: &str, f: impl Fn(Client, u64, Compression, bool) -> F)
where
    F: Future<Output = Result<Duration>> + Send + 'static,
{
    let runner = common::start_runner();
    let mut group = c.benchmark_group(name);
    group.throughput(Throughput::Bytes(mem::size_of::<SomeRow>() as u64));
    for validation in [true, false] {
        #[allow(clippy::single_element_loop)]
        for compression in [
            Compression::None,
            #[cfg(feature = "lz4")]
            Compression::Lz4,
        ] {
            group.bench_function(
                format!("validation={validation}/compression={compression:?}"),
                |b| {
                    b.iter_custom(|iters| {
                        let client = Client::default()
                            .with_url(format!("http://{ADDR}"))
                            .with_compression(compression)
                            .with_validation(validation);
                        runner.run((f)(client, iters, compression, validation))
                    })
                },
            );
        }
    }
    group.finish();
}

fn insert(c: &mut Criterion) {
    run(c, "insert", run_insert);
}

#[cfg(feature = "inserter")]
fn inserter(c: &mut Criterion) {
    run(c, "inserter", run_inserter::<false>);
    run(c, "inserter-period", run_inserter::<true>);
}

#[cfg(not(feature = "inserter"))]
criterion_group!(benches, insert);
#[cfg(feature = "inserter")]
criterion_group!(benches, insert, inserter);
criterion_main!(benches);
