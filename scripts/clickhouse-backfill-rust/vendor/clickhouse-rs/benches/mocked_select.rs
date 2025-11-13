use bytes::Bytes;
use clickhouse::{
    Client, Compression, Row,
    error::{Error, Result},
};
use clickhouse_types::{Column, DataTypeNode};
use criterion::{Criterion, Throughput, criterion_group, criterion_main};
use futures_util::stream::{self, StreamExt as _};
use http_body_util::StreamBody;
use hyper::{
    Request, Response,
    body::{Body, Frame, Incoming},
};
use serde::Deserialize;
use std::convert::Infallible;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::time::{Duration, Instant};

mod common;

async fn serve(
    request: Request<Incoming>,
    compression: Compression,
    with_validation: bool,
) -> Response<impl Body<Data = Bytes, Error = Infallible>> {
    common::skip_incoming(request).await;

    let maybe_schema = if with_validation {
        let schema = vec![
            Column::new("a".to_string(), DataTypeNode::UInt64),
            Column::new("b".to_string(), DataTypeNode::Int64),
            Column::new("c".to_string(), DataTypeNode::Int32),
            Column::new("d".to_string(), DataTypeNode::UInt32),
        ];

        let mut buffer = Vec::new();
        clickhouse_types::put_rbwnat_columns_header(&schema, &mut buffer).unwrap();

        let buffer = match compression {
            Compression::None => Bytes::from(buffer),
            #[cfg(feature = "lz4")]
            Compression::Lz4 => clickhouse::_priv::lz4_compress(&buffer).unwrap(),
            _ => unreachable!(),
        };

        Some(buffer)
    } else {
        None
    };

    let stream = stream::iter(maybe_schema)
        .chain(stream::repeat(prepare_chunk()))
        .map(|chunk| Ok(Frame::data(chunk)));

    Response::new(StreamBody::new(stream))
}

fn prepare_chunk() -> Bytes {
    use rand::{Rng, SeedableRng, distr::StandardUniform, rngs::SmallRng};

    // Generate random data to avoid _real_ compression.
    // TODO: It would be more useful to generate real data.
    let mut rng = SmallRng::seed_from_u64(0xBA5E_FEED);
    let raw: Vec<_> = (&mut rng)
        .sample_iter(StandardUniform)
        .take(128 * 1024)
        .collect();

    // If the feature is enabled, compress the data even if we use the `None`
    // compression. The compression ratio is low anyway due to random data.
    #[cfg(feature = "lz4")]
    let chunk = clickhouse::_priv::lz4_compress(&raw).unwrap();
    #[cfg(not(feature = "lz4"))]
    let chunk = Bytes::from(raw);

    chunk
}

const ADDR: SocketAddr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 6523));

fn select(c: &mut Criterion) {
    async fn start_server(compression: Compression, with_validation: bool) -> common::ServerHandle {
        common::start_server(ADDR, move |req| serve(req, compression, with_validation)).await
    }

    let runner = common::start_runner();

    #[derive(Default, Debug, Row, Deserialize)]
    struct SomeRow {
        a: u64,
        b: i64,
        c: i32,
        d: u32,
    }

    async fn select_rows(
        client: Client,
        iters: u64,
        compression: Compression,
        validation: bool,
    ) -> Result<Duration> {
        let client = client
            .with_compression(compression)
            .with_validation(validation);
        let _server = start_server(compression, validation).await;

        let mut sum = SomeRow::default();
        let start = Instant::now();
        let mut cursor = client
            .query("SELECT ?fields FROM some")
            .fetch::<SomeRow>()?;

        for _ in 0..iters {
            let Some(row) = cursor.next().await? else {
                return Err(Error::NotEnoughData);
            };
            sum.a = sum.a.wrapping_add(row.a);
            sum.b = sum.b.wrapping_add(row.b);
            sum.c = sum.c.wrapping_add(row.c);
            sum.d = sum.d.wrapping_add(row.d);
        }

        std::hint::black_box(sum);

        let elapsed = start.elapsed();
        Ok(elapsed)
    }

    async fn select_bytes(
        client: Client,
        min_size: u64,
        compression: Compression,
    ) -> Result<Duration> {
        let client = client.with_compression(compression);
        let _server = start_server(compression, false).await;

        let start = Instant::now();
        let mut cursor = client
            .query("SELECT value FROM some")
            .fetch_bytes("RowBinary")?;

        let mut size = 0;
        while size < min_size {
            let buf = std::hint::black_box(cursor.next().await?);
            size += buf.unwrap().len() as u64;
        }

        Ok(start.elapsed())
    }

    let mut group = c.benchmark_group("rows");
    group.throughput(Throughput::Bytes(size_of::<SomeRow>() as u64));
    group.bench_function("validation=off/uncompressed", |b| {
        b.iter_custom(|iters| {
            let client = Client::default().with_url(format!("http://{ADDR}"));
            runner.run(select_rows(client, iters, Compression::None, false))
        })
    });
    #[cfg(feature = "lz4")]
    group.bench_function("validation=off/lz4", |b| {
        b.iter_custom(|iters| {
            let client = Client::default().with_url(format!("http://{ADDR}"));
            runner.run(select_rows(client, iters, Compression::Lz4, false))
        })
    });
    group.bench_function("validation=on/uncompressed", |b| {
        b.iter_custom(|iters| {
            let client = Client::default().with_url(format!("http://{ADDR}"));
            runner.run(select_rows(client, iters, Compression::None, true))
        })
    });
    #[cfg(feature = "lz4")]
    group.bench_function("validation=on/lz4", |b| {
        b.iter_custom(|iters| {
            let client = Client::default().with_url(format!("http://{ADDR}"));
            runner.run(select_rows(client, iters, Compression::Lz4, true))
        })
    });
    group.finish();

    const MIB: u64 = 1024 * 1024;
    let mut group = c.benchmark_group("mbytes");
    group.throughput(Throughput::Bytes(MIB));
    group.bench_function("uncompressed", |b| {
        b.iter_custom(|iters| {
            let client = Client::default().with_url(format!("http://{ADDR}"));
            runner.run(select_bytes(client, iters * MIB, Compression::None))
        })
    });
    #[cfg(feature = "lz4")]
    group.bench_function("lz4", |b| {
        b.iter_custom(|iters| {
            let client = Client::default().with_url(format!("http://{ADDR}"));
            runner.run(select_bytes(client, iters * MIB, Compression::Lz4))
        })
    });
    group.finish();
}

criterion_group!(benches, select);
criterion_main!(benches);
