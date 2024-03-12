
#  used to nuke the dev environment for engineers

find . -name 'node_modules' -type d -prune -print -exec rm -rf '{}' \;
find . -name '.next' -type d -prune -print -exec rm -rf '{}' \;
find . -iname "bin" -type d -prune -print -exec rm -rf '{}' \;
find . -iname "dist" -type d -prune -print -exec rm -rf '{}' \;