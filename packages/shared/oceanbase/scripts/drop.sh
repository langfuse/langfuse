#!/bin/bash

# Call init.js with 'drop' command
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/init.js" drop

