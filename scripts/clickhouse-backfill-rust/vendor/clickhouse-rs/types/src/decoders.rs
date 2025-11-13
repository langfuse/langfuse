use crate::error::TypesError;
use crate::leb128::read_leb128;
use bytes::Buf;

#[inline]
pub(crate) fn read_string(mut buffer: impl Buf) -> Result<String, TypesError> {
    let length = read_leb128(&mut buffer)? as usize;
    if length == 0 {
        return Ok("".to_string());
    }
    ensure_size(&mut buffer, length)?;
    let result = String::from_utf8_lossy(&buffer.copy_to_bytes(length)).to_string();
    Ok(result)
}

#[inline]
pub(crate) fn ensure_size(buffer: impl Buf, size: usize) -> Result<(), TypesError> {
    if buffer.remaining() < size {
        Err(TypesError::NotEnoughData(format!(
            "expected at least {} bytes, but only {} bytes remaining",
            size,
            buffer.remaining()
        )))
    } else {
        Ok(())
    }
}
