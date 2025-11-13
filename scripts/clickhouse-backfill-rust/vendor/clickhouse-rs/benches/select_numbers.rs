use serde::Deserialize;

use crate::common_select::{
    BenchmarkRow, WithAccessType, WithId, do_select_bench, print_header, print_results,
};
use clickhouse::{Compression, Row};

mod common_select;

#[derive(Row, Deserialize)]
struct Data {
    number: u64,
}

impl_benchmark_row_no_access_type!(Data, number);

async fn bench(compression: Compression, validation: bool) {
    let stats = do_select_bench::<Data>(
        "SELECT number FROM system.numbers_mt LIMIT 500000000",
        compression,
        validation,
    )
    .await;
    assert_eq!(stats.result, 124999999750000000);
    print_results::<Data>(&stats, compression, validation);
}

#[tokio::main]
async fn main() {
    print_header(None);
    bench(Compression::None, false).await;
    bench(Compression::None, true).await;
    #[cfg(feature = "lz4")]
    {
        bench(Compression::Lz4, false).await;
        bench(Compression::Lz4, true).await;
    }
}
