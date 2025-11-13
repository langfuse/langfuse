use crate::error::Error;
use bytes::Buf;

/// TODO: it is theoretically possible to ensure size in chunks,
///  at least for some types, given that we have the database schema.
#[inline]
pub(crate) fn ensure_size(buffer: impl Buf, size: usize) -> crate::error::Result<()> {
    if buffer.remaining() < size {
        Err(Error::NotEnoughData)
    } else {
        Ok(())
    }
}

#[inline]
pub(crate) fn get_unsigned_leb128(mut buffer: impl Buf) -> crate::error::Result<u64> {
    let mut value = 0u64;
    let mut shift = 0;

    loop {
        ensure_size(&mut buffer, 1)?;

        let byte = buffer.get_u8();
        value |= (byte as u64 & 0x7f) << shift;

        if byte & 0x80 == 0 {
            break;
        }

        shift += 7;
        if shift > 57 {
            // TODO: what about another error?
            return Err(Error::NotEnoughData);
        }
    }

    Ok(value)
}

#[test]
fn it_deserializes_unsigned_leb128() {
    let buf = &[0xe5, 0x8e, 0x26][..];
    assert_eq!(get_unsigned_leb128(buf).unwrap(), 624_485);
}
