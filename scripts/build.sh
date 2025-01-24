#!/usr/bin/env bash
function quit {
    exit 1
}
echo "Requesting to delete dist/ directory..."
rm -rI dist/ # clean dist folder

node scripts/build_preload.js && tsc -p . && cp scripts/start.sh dist/ && chmod +x dist/start.sh

if [[ $? -eq 0 ]]; then
    echo "Typescript compilation successful"
    cp scripts/start.sh ./dist
else
    echo "Failed building"
    quit
fi
