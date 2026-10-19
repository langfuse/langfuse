
#  used to nuke the dev environment for engineers

# Remove whole Cargo caches before deleting nested out directories so build-script
# fingerprints cannot survive without their generated files.
rm -rf './ai-gateway/target' './packages/native/target'

find . -name 'node_modules' -type d -prune -print -exec rm -rf '{}' \;
find . -name '.next' -type d -prune -print -exec rm -rf '{}' \;
find . -iname "bin" -type d -prune -print -exec rm -rf '{}' \;
find . -iname "dist" -type d -prune -print -exec rm -rf '{}' \;
find . -iname "out" -type d -prune -print -exec rm -rf '{}' \;
find . -iname ".turbo" -type d -prune -print -exec rm -rf '{}' \;
find . -iname "tsconfig.tsbuildinfo" -type d -prune -print -exec rm -rf '{}' \;

pnpm store prune
