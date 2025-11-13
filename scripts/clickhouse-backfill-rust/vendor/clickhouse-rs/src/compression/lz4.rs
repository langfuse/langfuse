use std::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::{Buf, BufMut, Bytes, BytesMut};
use cityhash_rs::cityhash_102_128;
use futures_util::stream::Stream;
use lz4_flex::block;

use crate::{
    bytes_ext::BytesExt,
    error::{Error, Result},
    response::Chunk,
};

const MAX_COMPRESSED_SIZE: u32 = 1024 * 1024 * 1024;

pub(crate) struct Lz4Decoder<S> {
    stream: S,
    bytes: BytesExt,
    meta: Option<Lz4Meta>,
}

impl<S> Stream for Lz4Decoder<S>
where
    S: Stream<Item = Result<Bytes>> + Unpin,
{
    type Item = Result<Chunk>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let meta = loop {
            let size = self.bytes.remaining();
            let required_size = self
                .meta
                .as_ref()
                .map_or(LZ4_META_SIZE, Lz4Meta::total_size);

            if size < required_size {
                let stream = Pin::new(&mut self.stream);
                match ready!(stream.poll_next(cx)) {
                    Some(Ok(chunk)) => {
                        self.bytes.extend(chunk);
                        continue;
                    }
                    Some(Err(err)) => return Some(Err(err)).into(),
                    None if size > 0 => {
                        let err = Error::Decompression("malformed data".into());
                        return Poll::Ready(Some(Err(err)));
                    }
                    None => return Poll::Ready(None),
                }
            }

            debug_assert!(size >= required_size);

            match self.meta.take() {
                Some(meta) => break meta,
                None => self.meta = Some(self.read_meta()?),
            };
        };

        let data = self.read_data(&meta)?;
        let net_size = meta.total_size();
        self.bytes.advance(net_size);

        Poll::Ready(Some(Ok(Chunk { data, net_size })))
    }
}

// Meta = checksum + header
// - [16b] checksum
// - [ 1b] magic number (0x82)
// - [ 4b] compressed size (data + header)
// - [ 4b] uncompressed size
const LZ4_CHECKSUM_SIZE: usize = 16;
const LZ4_HEADER_SIZE: usize = 9;
const LZ4_META_SIZE: usize = LZ4_CHECKSUM_SIZE + LZ4_HEADER_SIZE;
const LZ4_MAGIC: u8 = 0x82;

struct Lz4Meta {
    checksum: u128,
    compressed_size: u32,
    uncompressed_size: u32,
}

impl Lz4Meta {
    fn total_size(&self) -> usize {
        LZ4_CHECKSUM_SIZE + self.compressed_size as usize
    }

    fn read(mut bytes: &[u8]) -> Result<Lz4Meta> {
        let checksum = bytes.get_u128_le();
        let magic = bytes.get_u8();
        let compressed_size = bytes.get_u32_le();
        let uncompressed_size = bytes.get_u32_le();

        if magic != LZ4_MAGIC {
            return Err(Error::Decompression("incorrect magic number".into()));
        }

        if compressed_size > MAX_COMPRESSED_SIZE {
            return Err(Error::Decompression("too big compressed data".into()));
        }

        Ok(Lz4Meta {
            checksum,
            compressed_size,
            uncompressed_size,
        })
    }

    fn write_checksum(&self, mut buffer: &mut [u8]) {
        buffer.put_u128_le(self.checksum);
    }

    fn write_header(&self, mut buffer: &mut [u8]) {
        buffer.put_u8(LZ4_MAGIC);
        buffer.put_u32_le(self.compressed_size);
        buffer.put_u32_le(self.uncompressed_size);
    }
}

impl<S> Lz4Decoder<S> {
    pub(crate) fn new(stream: S) -> Self {
        Self {
            stream,
            bytes: BytesExt::default(),
            meta: None,
        }
    }

    fn read_meta(&mut self) -> Result<Lz4Meta> {
        Lz4Meta::read(self.bytes.slice())
    }

    fn read_data(&mut self, meta: &Lz4Meta) -> Result<Bytes> {
        let total_size = meta.total_size();
        let bytes = &self.bytes.slice()[..total_size];

        let actual_checksum = calc_checksum(&bytes[LZ4_CHECKSUM_SIZE..]);
        if actual_checksum != meta.checksum {
            return Err(Error::Decompression("checksum mismatch".into()));
        }

        let uncompressed = block::decompress_size_prepended(&bytes[(LZ4_META_SIZE - 4)..])
            .map_err(|err| Error::Decompression(err.into()))?;

        debug_assert_eq!(uncompressed.len() as u32, meta.uncompressed_size);
        Ok(uncompressed.into())
    }
}

fn calc_checksum(buffer: &[u8]) -> u128 {
    let hash = cityhash_102_128(buffer);
    hash.rotate_right(64)
}

pub(crate) fn compress(uncompressed: &[u8]) -> Result<Bytes> {
    let max_compressed_size = block::get_maximum_output_size(uncompressed.len());

    let mut buffer = BytesMut::new();
    buffer.resize(LZ4_META_SIZE + max_compressed_size, 0);

    let compressed_data_size = block::compress_into(uncompressed, &mut buffer[LZ4_META_SIZE..])
        .map_err(|err| Error::Compression(err.into()))?;

    buffer.truncate(LZ4_META_SIZE + compressed_data_size);

    let mut meta = Lz4Meta {
        checksum: 0, // will be calculated below.
        compressed_size: (LZ4_HEADER_SIZE + compressed_data_size) as u32,
        uncompressed_size: uncompressed.len() as u32,
    };

    meta.write_header(&mut buffer[LZ4_CHECKSUM_SIZE..]);
    meta.checksum = calc_checksum(&buffer[LZ4_CHECKSUM_SIZE..]);
    meta.write_checksum(&mut buffer[..]);

    Ok(buffer.freeze())
}

#[tokio::test]
async fn it_decompresses() {
    use futures_util::stream::{self, TryStreamExt};

    let expected = vec![
        1u8, 0, 2, 255, 255, 255, 255, 0, 1, 1, 1, 115, 6, 83, 116, 114, 105, 110, 103, 3, 97, 98,
        99,
    ];

    let source = vec![
        245_u8, 5, 222, 235, 225, 158, 59, 108, 225, 31, 65, 215, 66, 66, 36, 92,   // checksum
        0x82, // magic number
        34, 0, 0, 0, // compressed size (data + header)
        23, 0, 0, 0, // uncompressed size
        240, 8, 1, 0, 2, 255, 255, 255, 255, 0, 1, 1, 1, 115, 6, 83, 116, 114, 105, 110, 103, 3,
        97, 98, 99,
    ];

    async fn test(chunks: &[&[u8]], expected: &[u8]) {
        let stream = stream::iter(
            chunks
                .iter()
                .map(|s| Bytes::copy_from_slice(s))
                .map(Ok::<_, Error>)
                .collect::<Vec<_>>(),
        );
        let mut decoder = Lz4Decoder::new(stream);
        let actual = decoder.try_next().await.unwrap().unwrap();
        assert_eq!(actual.data, expected);
        assert_eq!(
            actual.net_size,
            chunks.iter().map(|s| s.len()).sum::<usize>()
        );
    }

    // 1 chunk.
    test(&[&source], &expected).await;

    // 2 chunks.
    for i in 0..source.len() {
        let (left, right) = source.split_at(i);
        test(&[left, right], &expected).await;

        // 3 chunks.
        for j in i..source.len() {
            let (right_a, right_b) = right.split_at(j - i);
            test(&[left, right_a, right_b], &expected).await;
        }
    }
}

#[test]
fn it_compresses() {
    let source = vec![
        1u8, 0, 2, 255, 255, 255, 255, 0, 1, 1, 1, 115, 6, 83, 116, 114, 105, 110, 103, 3, 97, 98,
        99,
    ];

    let expected = vec![
        245_u8, 5, 222, 235, 225, 158, 59, 108, 225, 31, 65, 215, 66, 66, 36, 92, 130, 34, 0, 0, 0,
        23, 0, 0, 0, 240, 8, 1, 0, 2, 255, 255, 255, 255, 0, 1, 1, 1, 115, 6, 83, 116, 114, 105,
        110, 103, 3, 97, 98, 99,
    ];

    let actual = compress(&source).unwrap();
    assert_eq!(actual, expected);
}
