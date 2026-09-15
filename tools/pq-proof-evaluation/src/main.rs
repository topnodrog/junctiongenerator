use jgc_pq_proof_evaluation::{claim, envelope, program, witness};
use std::{fs::OpenOptions, io::Write, time::Instant};
use triton_vm::prelude::*;

fn benchmark(export: Option<&str>) {
    // Synthetic, non-secret fixture. Actual prover randomness stays fresh.
    let stark = Stark::default();
    let claim = claim(1);
    let started = Instant::now();
    let proof = triton_vm::prove(stark, &claim, program(), witness([40, 60, 70, 29]))
        .expect("valid fixture must prove");
    let prove_ms = started.elapsed().as_secs_f64() * 1000.0;
    if let Some(path) = export {
        let bytes = envelope::encode(&proof, 1).expect("fixture encoding");
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .expect("create new fixture file")
            .write_all(&bytes)
            .expect("write fixture");
    }
    let started = Instant::now();
    assert!(triton_vm::verify(stark, &claim, &proof));
    let verify_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{}",
        serde_json::json!({
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
        })
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [] => benchmark(None),
        [mode, path] if mode == "prove" => benchmark(Some(path)),
        [mode, path, fee] if mode == "verify" => {
            // The CLI returns bounded errors; caught backend panics are rejection.
            std::panic::set_hook(Box::new(|_| {}));
            let started = Instant::now();
            let result = fee
                .parse::<u32>()
                .map_err(|_| "invalid expected fee")
                .and_then(|fee| {
                    envelope::read_bounded(path).and_then(|bytes| envelope::verify(&bytes, fee))
                });
            println!(
                "{}",
                serde_json::json!({
                    "schemaVersion": 1, "mode": "verify-only", "valid": result.is_ok(),
                    "error": result.err(), "verifyMs": started.elapsed().as_secs_f64() * 1000.0,
                    "productionReady": false
                })
            );
            if result.is_err() {
                std::process::exit(1);
            }
        }
        _ => {
            eprintln!("usage: jgc-pq-proof-evaluation [prove NEW_FILE | verify FILE EXPECTED_FEE]");
            std::process::exit(2);
        }
    }
}
