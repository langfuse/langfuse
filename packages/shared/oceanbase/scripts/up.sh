#!/bin/bash

# Call init.js with 'up' command
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/init.js" up

