#!/bin/sh
# Build emoose's xex1tool (BSD-3, part of idaxex) into vendor/idaxex.
# Needs cmake >= 3.25 and ninja: `brew install cmake ninja`.
# Idempotent: skips the clone and the build when their outputs exist.
set -e
cd "$(dirname "$0")/.."
if ! command -v cmake >/dev/null || ! command -v ninja >/dev/null; then
  echo "xex1tool: cmake and ninja are required (brew install cmake ninja)" >&2
  exit 1
fi
if [ ! -d vendor/idaxex ]; then
  git clone --recursive https://github.com/emoose/idaxex.git vendor/idaxex
fi
if [ ! -x vendor/idaxex/xex1tool/build/xex1tool ]; then
  cmake -S vendor/idaxex/xex1tool -B vendor/idaxex/xex1tool/build -G Ninja
  cmake --build vendor/idaxex/xex1tool/build
fi
vendor/idaxex/xex1tool/build/xex1tool >/dev/null 2>&1 || true
echo "xex1tool: $(pwd)/vendor/idaxex/xex1tool/build/xex1tool"
