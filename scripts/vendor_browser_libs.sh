#!/usr/bin/env bash
# Run ON THE USER'S CONNECTED COMPUTER. Pin versions for reproducibility.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor
curl --fail --location --retry 3 -o vendor/three.module.js \
  https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js
curl --fail --location --retry 3 -o vendor/ort.min.js \
  https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js
for f in ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.jsep.wasm ort-wasm-simd-threaded.jsep.mjs; do
 curl --fail --location --retry 2 -o "vendor/$f" \
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/$f" || rm -f "vendor/$f"
done
printf 'Local browser dependencies downloaded. Open the app through a local HTTP server, not file://\n'
