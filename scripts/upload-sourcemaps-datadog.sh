# Ensure @datadog/datadog-ci is added to your package.json and installed
# You can add it by running: pnpm add @datadog/datadog-ci

# Ensure the DATADOG_API_KEY_EU environment variable is set
if [ -z "$DATADOG_API_KEY_EU" ]; then
  echo "DATADOG_API_KEY_EU is not set. Please set it before running this script."
  exit 1
fi

if [ -z "$DATADOG_API_KEY_US" ]; then
  echo "DATADOG_API_KEY_US is not set. Please set it before running this script."
  exit 1
fi

# Check if all required arguments are provided
if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <minified-path-prefix> <project-path> <service> <dist-path>"
  exit 1
fi

MINIFIED_PATH_PREFIX=$1
PROJECT_PATH=$2
SERVICE=$3
DIST_PATH=$4

# Get the short SHA of the current commit. Same release number as Porter
RELEASE_VERSION=$(git rev-parse --short HEAD)

echo "Uploading sourcemaps to Datadog EU for version [$RELEASE_VERSION] with minified path prefix [$MINIFIED_PATH_PREFIX]"

# Upload to Datadog EU for viewing unminified sources in Datadog. Datadog does not appear to support import from an S3 URL
# Because this command runs from a Git repo context, Datadog should also automatically link to our project from the UI.
# Reference: https://docs.datadoghq.eu/real_user_monitoring/guide/upload-javascript-source-maps/?tab=webpackjs
# Reference: https://github.com/DataDog/datadog-ci/tree/master/src/commands/sourcemaps#commands
# `release-version` must match the version in initErrorReporter.ts and performance.ts
# project-path is the prefix before src in the map: webpack:///./src/bricks/registry.ts
DATADOG_API_KEY=$DATADOG_API_KEY_EU DATADOG_SITE=datadoghq.eu npx --yes @datadog/datadog-ci sourcemaps upload "$DIST_PATH" \
  --service="$SERVICE" \
  --release-version="$RELEASE_VERSION" \
  --minified-path-prefix="$MINIFIED_PATH_PREFIX" \
  --project-path="$PROJECT_PATH"

echo "Uploading sourcemaps to Datadog US for version [$RELEASE_VERSION] with minified path prefix [$MINIFIED_PATH_PREFIX]"

# Upload to Datadog US for viewing unminified sources in Datadog. Datadog does not appear to support import from an S3 URL
# Because this command runs from a Git repo context, Datadog should also automatically link to our project from the UI.
# Reference: https://docs.datadoghq.com/real_user_monitoring/guide/upload-javascript-source-maps/?tab=webpackjs
# Reference: https://github.com/DataDog/datadog-ci/tree/master/src/commands/sourcemaps#commands
# `release-version` must match the version in initErrorReporter.ts and performance.ts
# project-path is the prefix before src in the map: webpack:///./src/bricks/registry.ts
DATADOG_API_KEY=$DATADOG_API_KEY_US npx --yes @datadog/datadog-ci sourcemaps upload "$DIST_PATH" \
  --service="$SERVICE" \
  --release-version="$RELEASE_VERSION" \
  --minified-path-prefix="$MINIFIED_PATH_PREFIX" \
  --project-path="$PROJECT_PATH"