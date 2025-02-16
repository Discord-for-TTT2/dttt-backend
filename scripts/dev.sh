#!/usr/bin/env bash

node scripts/dev_preload.js && DEBUG=1 nodemon --ignore 'dist/*' --ignore 'config.json' src/index.ts "$@"

if [[ $? -eq 0 ]]; then
    echo "Failed starting dev script. Exiting..."
fi