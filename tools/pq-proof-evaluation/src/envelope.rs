//! Research-only format. Fixed program and parameters; never a network protocol.
use std::{fs::File, io::Read, panic::catch_unwind};
use triton_vm::{prelude::*, proof_item::ProofItem, proof_stream::ProofStream};

pub const HEADER_BYTES: usize = 64;
pub const MAX_ELEMENTS: usize = 131_072;
pub const MAX_BYTES: usize = HEADER_BYTES + MAX_ELEMENTS * 8;
pub const MAX_LOG2_HEIGHT: u32 = 12;
const MAGIC: &[u8; 8] = b"JGCPQE01";

fn header(fee: u32, count: usize) -> Vec<u8> {
    let mut bytes = MAGIC.to_vec();
    bytes.extend_from_slice(&1_u32.to_le_bytes());
    bytes.extend_from_slice(&triton_vm::proof::CURRENT_VERSION.to_le_bytes());
    bytes.extend_from_slice(&fee.to_le_bytes());
    for element in crate::program().hash().values() {
        bytes.extend_from_slice(&element.value().to_le_bytes());
    }
    bytes.extend_from_slice(&(count as u32).to_le_bytes());
    bytes
}

pub fn encode(proof: &Proof, fee: u32) -> Result<Vec<u8>, &'static str> {
    if proof.0.is_empty() || proof.0.len() > MAX_ELEMENTS {
        return Err("proof length");
    }
    let mut bytes = header(fee, proof.0.len());
    for element in &proof.0 {
        bytes.extend_from_slice(&element.value().to_le_bytes());
    }
    Ok(bytes)
}

/// Cap actual reads, even if file metadata is stale or a file grows during IO.
pub fn read_bounded(path: &str) -> Result<Vec<u8>, &'static str> {
    let file = File::open(path).map_err(|_| "open failed")?;
    if !file.metadata().map_err(|_| "metadata failed")?.is_file() {
        return Err("regular file required");
    }
    let mut bytes = Vec::new();
    file.take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "read failed")?;
    if bytes.len() > MAX_BYTES {
        return Err("envelope too large");
    }
    Ok(bytes)
}

fn decode(bytes: &[u8], expected_fee: u32) -> Result<Proof, &'static str> {
    if bytes.len() < HEADER_BYTES || bytes.len() > MAX_BYTES {
        return Err("envelope length");
    }
    let count = u32::from_le_bytes(bytes[60..64].try_into().unwrap()) as usize;
    if count == 0 || count > MAX_ELEMENTS || bytes.len() != HEADER_BYTES + count * 8 {
        return Err("proof length");
    }
    if bytes[..HEADER_BYTES] != header(expected_fee, count) {
        return Err("context mismatch");
    }
    let mut elements = Vec::with_capacity(count);
    for encoded in bytes[HEADER_BYTES..].chunks_exact(8) {
        let value = u64::from_le_bytes(encoded.try_into().unwrap());
        // BFieldElement::new reduces modulo p: reject alternate encodings first.
        if value >= BFieldElement::P {
            return Err("noncanonical field element");
        }
        elements.push(BFieldElement::new(value));
    }
    Ok(Proof(elements))
}

pub fn verify(bytes: &[u8], expected_fee: u32) -> Result<(), &'static str> {
    let proof = decode(bytes, expected_fee)?;
    // An unwind is rejection, never acceptance. Allocation aborts/timeouts still
    // require process resource isolation; this is not a public verifier service.
    catch_unwind(|| {
        let stream = ProofStream::try_from(&proof).map_err(|_| "malformed proof stream")?;
        if stream.items.is_empty() || stream.items.len() > 128 {
            return Err("proof item count");
        }
        if Proof::from(&stream) != proof {
            return Err("noncanonical proof stream");
        }
        let Some(ProofItem::Log2PaddedHeight(height)) = stream.items.first() else {
            return Err("missing initial height");
        };
        if *height > MAX_LOG2_HEIGHT {
            return Err("height limit");
        }
        if stream
            .items
            .iter()
            .filter(|item| matches!(item, ProofItem::Log2PaddedHeight(_)))
            .count()
            != 1
        {
            return Err("duplicate height");
        }
        Stark::default()
            .verify(&crate::claim(expected_fee as u64), &proof)
            .map_err(|_| "invalid proof")
    })
    .unwrap_or(Err("verifier panic"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_proof_context_and_complete_transcript_are_required() {
        let original = include_bytes!("../evidence/balance-v1.pqe");
        assert!(verify(original, 1).is_ok());
        let mut changed_fee = original.to_vec();
        changed_fee[16..20].copy_from_slice(&2_u32.to_le_bytes());
        assert_eq!(Err("invalid proof"), verify(&changed_fee, 2));
        let proof = decode(original, 1).unwrap();
        let mut stream = ProofStream::try_from(&proof).unwrap();
        stream.enqueue(ProofItem::MerkleRoot(crate::program().hash()));
        assert_eq!(
            Err("invalid proof"),
            verify(&encode(&Proof::from(stream), 1).unwrap(), 1)
        );
    }

    #[test]
    fn rejects_malformed_envelopes_before_backend() {
        let proof = Proof(vec![BFieldElement::new(0)]);
        let original = encode(&proof, 1).unwrap();
        for offset in [0, 8, 12, 16, 20, 59, 60] {
            let mut bytes = original.clone();
            bytes[offset] ^= 1;
            assert!(decode(&bytes, 1).is_err(), "offset {offset}");
        }
        for length in 0..original.len() {
            assert!(decode(&original[..length], 1).is_err());
        }
        let mut extra = original.clone();
        extra.push(0);
        assert!(decode(&extra, 1).is_err());
        let mut noncanonical = original.clone();
        noncanonical[64..72].copy_from_slice(&BFieldElement::P.to_le_bytes());
        assert!(decode(&noncanonical, 1).is_err());
        let oversized = vec![0; MAX_BYTES + 1];
        assert!(decode(&oversized, 1).is_err());
    }

    #[test]
    fn rejects_hostile_height_without_shifting() {
        for height in [MAX_LOG2_HEIGHT + 1, 30, 63, 64, u32::MAX] {
            let mut stream = ProofStream::new();
            stream.enqueue(ProofItem::Log2PaddedHeight(height));
            let bytes = encode(&Proof::from(stream), 1).unwrap();
            assert_eq!(Err("height limit"), verify(&bytes, 1));
        }
        let mut stream = ProofStream::new();
        stream.enqueue(ProofItem::Log2PaddedHeight(9));
        stream.enqueue(ProofItem::Log2PaddedHeight(9));
        assert_eq!(
            Err("duplicate height"),
            verify(&encode(&Proof::from(stream), 1).unwrap(), 1)
        );
    }

    #[test]
    fn bounded_deterministic_malformed_corpus_never_accepts() {
        // Deliberately malformed lengths/discriminants, not random-byte proof validity claims.
        for length in 1..64 {
            for value in [0, 1, u32::MAX as u64, BFieldElement::P - 1] {
                let proof = Proof(vec![BFieldElement::new(value); length]);
                assert!(verify(&encode(&proof, 1).unwrap(), 1).is_err());
            }
        }
    }
}
