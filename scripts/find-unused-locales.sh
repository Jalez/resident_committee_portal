#!/bin/bash

# Directory where the app source code is
APP_DIR="app"
# Directory where the locale files are
LOCALES_DIR="public/locales"
# Source language to detect unused keys from
SOURCE_LANG="en"
SOURCE_FILE="$LOCALES_DIR/$SOURCE_LANG/common.json"
# Output file for unused keys
OUTPUT_FILE="unused_keys.txt"

# Whitelisted prefixes (keys starting with these are considered dynamic and "used")
WHITELIST=(
    "treasury.reimbursements.statuses."
    "treasury.breakdown.statuses."
    "treasury.categories."
    "treasury.types."
    "inventory.modals.remove.reasons."
    "polls.new.type_"
    "treasury.budgets.statuses."
    "common.categories."
    "common.types."
)

echo "Checking for unused translation keys in $APP_DIR..."
echo "Source of truth: $SOURCE_FILE"
echo "------------------------------------------------"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install it to use this script."
    exit 1
fi

# Reset output file
> "$OUTPUT_FILE"

# Initialize counts
total_keys=0
unused_count=0
whitelisted_count=0

# Extract all keys, flattened with dot notation
keys=$(jq -r 'paths(scalars) as $p | $p | join(".")' "$SOURCE_FILE")

for key in $keys; do
    ((total_keys++))
    
    # Check if key is whitelisted
    is_whitelisted=false
    for prefix in "${WHITELIST[@]}"; do
        if [[ "$key" == "$prefix"* ]]; then
            is_whitelisted=true
            break
        fi
    done
    
    if [ "$is_whitelisted" = true ]; then
        ((whitelisted_count++))
        continue
    fi
    
    # Search for the key in the app directory
    # We search for the key verbatim (e.g., "common.actions.save")
    # or with namespace prefix (unlikely but safe)
    if ! grep -rqE "\"$key\"|'$key'|\`$key\`" "$APP_DIR"; then
        echo "$key" >> "$OUTPUT_FILE"
        ((unused_count++))
    fi
done

echo "------------------------------------------------"
echo "Finished checking."
echo "Total keys scanned: $total_keys"
echo "Whitelisted (dynamic): $whitelisted_count"
echo "Potentially unused: $unused_count"
echo "Unused keys saved to: $OUTPUT_FILE"
echo ""
echo "Note: Double check $OUTPUT_FILE before running removal."
