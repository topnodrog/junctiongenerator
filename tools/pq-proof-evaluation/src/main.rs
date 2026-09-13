//! Isolated, valueless backend experiment. Never imported by node consensus.
//! Only proves a bounded integer balance relation, not ownership or payments.
use std::time::Instant;
use triton_vm::prelude::*;

fn program() -> Program {
    triton_program!(
        divine 1 call range_u32
        divine 1 call range_u32 add
        divine 1 call range_u32
        divine 1 call range_u32 add
        read_io 1 call range_u32 add
        eq assert halt

        range_u32:
            dup 0 split pop 1 push 0 eq assert return
    )
}

fn witness(values: [u64; 4]) -> NonDeterminism {
    NonDeterminism::from(values.map(BFieldElement::new))
}

fn claim(fee: u64) -> Claim {
    Claim::about_program(&program()).with_input(vec![BFieldElement::new(fee)])
}

fn main() {
    // Synthetic, non-secret fixture. Actual prover randomness stays fresh.
    let stark = Stark::default();
    let claim = claim(1);
    let started = Instant::now();
    let proof = triton_vm::prove(stark, &claim, program(), witness([40, 60, 70, 29]))
        .expect("valid fixture must prove");
    let prove_ms = started.elapsed().as_secs_f64() * 1000.0;
    let started = Instant::now();
    assert!(triton_vm::verify(stark, &claim, &proof));
    let verify_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!("{}", serde_json::json!({
        "schemaVersion": 1,
        "backend": "triton-vm",
        "backendVersion": "8.0.0",
        "experiment": "two-input-two-output-u32-balance-only",
        "productionReady": false,
        "parameters": stark,
        "claim": claim,
        "paddedHeight": proof.padded_height().expect("valid proof height"),
        "proofFieldElements": proof.0.len(),
        "proofRawU64Bytes": proof.0.len() * 8,
        "proveMs": prove_ms,
        "verifyMs": verify_ms,
        "peakMemoryBytes": null,
        "memoryMeasurement": "not measured by this executable",
        "arch": std::env::consts::ARCH,
        "os": std::env::consts::OS,
        "rayonThreads": std::env::var("RAYON_NUM_THREADS").ok()
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integer_constraints_reject_inflation_and_field_wraparound() {
        let run = |values, fee| VM::run(program(), vec![BFieldElement::new(fee)].into(), witness(values));
        assert!(run([40, 60, 70, 29], 1).is_ok());
        assert!(run([0, 0, 0, 0], 0).is_ok());
        assert!(run([u32::MAX as u64; 4], 0).is_ok());
        assert!(run([40, 60, 70, 30], 1).is_err());
        // Equal sums alone would accept these; each limb must be range checked.
        for index in 0..4 {
            let mut values = [0; 4];
            values[index] = 1_u64 << 32;
            values[(index + 2) % 4] = 1_u64 << 32;
            assert!(run(values, 0).is_err());
        }
        assert!(run([0, 0, 0, 1], BFieldElement::P - 1).is_err());
        assert!(run([1_u64 << 32, 0, 0, 0], 1_u64 << 32).is_err());
    }

    #[test]
    fn real_proof_binds_claim_and_rejects_corruption() {
        let stark = Stark::default();
        let original = claim(1);
        // Pin the program/ISA commitment for cross-platform regression coverage.
        assert_eq!(
            serde_json::to_value(&original).unwrap()["program_digest"],
            "ff65f54d9c639ec5c25e12e0b4bf9597134a7c7e7ef4644e22228e5eabe0a91b234ffabbaaa0b420"
        );
        let proof = triton_vm::prove(stark, &original, program(), witness([40, 60, 70, 29])).unwrap();
        assert!(triton_vm::verify(stark, &original, &proof));
        assert!(!triton_vm::verify(stark, &claim(2), &proof));
        let mut changed = original.clone();
        changed.program_digest = triton_program!(halt).hash();
        assert!(!triton_vm::verify(stark, &changed, &proof));
        changed = original.clone();
        changed.version += 1;
        assert!(!triton_vm::verify(stark, &changed, &proof));
        changed = original.clone();
        changed.output.push(BFieldElement::new(1));
        assert!(!triton_vm::verify(stark, &changed, &proof));
        let mut corrupt = proof.clone();
        let last = corrupt.0.last_mut().unwrap();
        *last += BFieldElement::new(1);
        assert!(!triton_vm::verify(stark, &original, &corrupt));
        corrupt = proof.clone();
        corrupt.0.truncate(corrupt.0.len() / 2);
        assert!(!triton_vm::verify(stark, &original, &corrupt));
        assert!(triton_vm::prove(stark, &original, program(), witness([40, 60, 70, 30])).is_err());
    }
}
