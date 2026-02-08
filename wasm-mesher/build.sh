#!/bin/bash

# Build WASM mesher
# Usage: ./build.sh [web|nodejs|both] [--clean|--dev]
# Default: both
# Options:
#   --clean  - Clean build artifacts before building (cargo clean)
#   --dev    - Build in dev mode (faster, larger, includes debug info)

set -e

cd "$(dirname "$0")"

# Parse arguments
TARGET="web"
CLEAN=false
DEV_MODE=false

for arg in "$@"; do
  case "$arg" in
    web|nodejs|both)
      TARGET="$arg"
      ;;
    --clean)
      CLEAN=true
      ;;
    --dev)
      DEV_MODE=true
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# Clean if requested
if [ "$CLEAN" = true ]; then
  echo "🧹 Cleaning build artifacts..."
  cargo clean
  echo ""
fi

# Build flags
BUILD_FLAGS=""
if [ "$DEV_MODE" = true ]; then
  BUILD_FLAGS="--dev"
  echo "🔧 Building in DEV mode (faster compilation, includes debug info)"
else
  echo "🔧 Building in RELEASE mode (optimized, smaller binary)"
fi

case "$TARGET" in
  web)
    echo "🔨 Building WASM mesher for web target..."
    wasm-pack build --target web --out-dir ../../wasm $BUILD_FLAGS
    echo "✅ Build complete! (web target)"
    echo "📦 Output: ../../wasm/"
    ;;
  nodejs)
    echo "🔨 Building WASM mesher for nodejs target..."
    wasm-pack build --target nodejs --out-dir ../../wasm $BUILD_FLAGS
    echo "✅ Build complete! (nodejs target)"
    echo "📦 Output: ../../wasm/"
    ;;
  both)
    echo "🔨 Building WASM mesher for both targets..."
    echo ""
    echo "📦 Building for web target..."
    wasm-pack build --target web --out-dir ../../wasm $BUILD_FLAGS
    echo ""
    echo "📦 Building for nodejs target..."
    wasm-pack build --target nodejs --out-dir ../../wasm $BUILD_FLAGS
    echo ""
    echo "✅ Build complete! (both targets)"
    echo "📦 Output: ../../wasm/"
    echo "⚠️  Note: nodejs target overwrites web target in wasm/"
    ;;
  *)
    echo "Usage: $0 [web|nodejs|both] [--clean] [--dev]"
    echo "  web|nodejs|both - Target to build (default: both)"
    echo "  --clean          - Clean build artifacts before building"
    echo "  --dev            - Build in dev mode (faster, includes debug info)"
    exit 1
    ;;
esac
