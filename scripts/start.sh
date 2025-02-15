#!/usr/bin/env bash

OWN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$OWN_DIR/index.js" "$@"


if [[ $? -eq 127 ]]; then
    echo "Node.js is required to run this program, you can find installation instructions here: https://nodejs.org/en/download"
fi