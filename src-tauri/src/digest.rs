//! SHA-256 as lowercase hex (`sha256sum`'s spelling), for bundle checksums and
//! the device id's fingerprint.

use sha2::{Digest, Sha256};

/// Streamed through the hasher, so a multi-gigabyte file is never held in memory.
pub fn sha256_hex(mut data: impl std::io::Read) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    std::io::copy(&mut data, &mut hasher)?;
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    #[test]
    fn matches_sha256sum() {
        assert_eq!(
            super::sha256_hex("abc".as_bytes()).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
