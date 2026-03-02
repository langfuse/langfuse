#!/bin/bash

# Call init.js with 'down' command
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/init.js" down

