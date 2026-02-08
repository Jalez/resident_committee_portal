#!/bin/bash

# Directory where the locale files are
LOCALES_DIR="public/locales"
# Input file with unused keys (dot-notation)
UNUSED_KEYS_FILE="unused_keys.txt"

if [ ! -f "$UNUSED_KEYS_FILE" ]; then
    echo "Error: $UNUSED_KEYS_FILE not found. Run find-unused-locales.sh first."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed."
    exit 1
fi

# Convert dot-notation keys to jq paths
# common.actions.close -> .common.actions.close
# We prepend a dot to each line.
# If a key contains characters that need quoting (e.g. hyphens), we might need more care.
# But these keys seem standard.
# If they have hyphens, we should use .["key"].
# Let's be safe and convert to .["part1"]["part2"] style.
# common.actions.close -> .["common"]["actions"]["close"]

convert_to_jq_path() {
    local key=$1
    local jq_path=""
    IFS='.' read -ra ADDR <<< "$key"
    for i in "${ADDR[@]}"; do
        jq_path="$jq_path[\"$i\"]"
    done
    echo ".$jq_path"
}

# Build the jq filter string
# We want: del(.["path1"]) | del(.["path2"]) ...
echo "Building removal filter..."
FILTER=""
while IFS= read -r key || [ -n "$key" ]; do
    [ -z "$key" ] && continue
    jq_path=$(convert_to_jq_path "$key")
    if [ -z "$FILTER" ]; then
        FILTER="del($jq_path)"
    else
        FILTER="$FILTER | del($jq_path)"
    fi
done < "$UNUSED_KEYS_FILE"

# Process each language file
echo "Applying cleanup to all localization files..."
for lang_dir in "$LOCALES_DIR"/*; do
    if [ -d "$lang_dir" ]; then
        lang=$(basename "$lang_dir")
        for json_file in "$lang_dir"/*.json; do
            echo "Processing $lang/$(basename "$json_file")..."
            
            # Create a temporary file
            tmp_file=$(mktemp)
            
            # Run jq with the filter
            if jq "$FILTER" "$json_file" > "$tmp_file"; then
                mv "$tmp_file" "$json_file"
                echo "  Success: $(basename "$json_file") cleaned up."
            else
                echo "  Error: Failed to process $json_file"
                rm "$tmp_file"
            fi
        done
    fi
done

echo "------------------------------------------------"
echo "Cleanup complete."
