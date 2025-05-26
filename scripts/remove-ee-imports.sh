#!/bin/bash

# Script to remove all conditional references which contain /ee/ in the path
# and replace them with exceptions for FOSS builds.

set -e

echo "🔍 Removing EE imports and replacing with exceptions..."

# Find all TypeScript/JavaScript files excluding node_modules, dist, build, .next, and ee directories
find_files() {
  find web/src worker/src packages/shared/src \
    -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -path "*/build/*" \
    ! -path "*/.next/*" \
    ! -path "*/ee/*" \
    2>/dev/null || true
}

# Counter for modified files
modified_count=0

# Process each file
while IFS= read -r file; do
  if [ ! -f "$file" ]; then
    continue
  fi
  
  # Check if file contains EE imports
  if grep -q "/ee/" "$file" 2>/dev/null; then
    echo "Processing: $file"
    
    # Create backup
    cp "$file" "$file.bak"
    
    # Replace static imports with comments and error throwing
    sed -i.tmp 's|import[^;]*from[[:space:]]*["'"'"'][^"'"'"']*\/ee\/[^"'"'"']*["'"'"'][[:space:]]*;|// EE import removed for FOSS build\n// throw new Error("Enterprise feature not available in FOSS build");|g' "$file"
    
    # Replace export re-exports
    sed -i.tmp 's|export[^;]*from[[:space:]]*["'"'"'][^"'"'"']*\/ee\/[^"'"'"']*["'"'"'][[:space:]]*;|// EE export removed for FOSS build\n// throw new Error("Enterprise feature not available in FOSS build");|g' "$file"
    
    # Replace dynamic imports (await import)
    sed -i.tmp 's|await[[:space:]]\+import[[:space:]]*([[:space:]]*["'"'"'][^"'"'"']*\/ee\/[^"'"'"']*["'"'"'][[:space:]]*)|Promise.reject(new Error("Enterprise feature not available in FOSS build"))|g' "$file"
    
    # Replace regular dynamic imports
    sed -i.tmp 's|import[[:space:]]*([[:space:]]*["'"'"'][^"'"'"']*\/ee\/[^"'"'"']*["'"'"'][[:space:]]*)|Promise.reject(new Error("Enterprise feature not available in FOSS build"))|g' "$file"
    
    # Clean up temporary file
    rm -f "$file.tmp"
    
    # Check if file was actually modified
    if ! cmp -s "$file" "$file.bak"; then
      echo "  ✓ Modified file"
      ((modified_count++))
    fi
    
    # Remove backup
    rm -f "$file.bak"
  fi
done < <(find_files)

echo ""
echo "✅ Completed! Modified $modified_count files."
echo ""
echo "⚠️  Note: You may need to manually review and fix some files where EE functionality is deeply integrated."
echo "💡 Consider running your linter and tests after this transformation."
echo ""
echo "🔧 To run the TypeScript linter:"
echo "   pnpm lint"
echo ""
echo "🧪 To run tests:"
echo "   pnpm test" 