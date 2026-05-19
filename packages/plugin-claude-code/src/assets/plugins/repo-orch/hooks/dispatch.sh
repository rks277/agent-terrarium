#!/bin/sh
# repo-orch hook dispatcher — maildir write, atomic.
# Reads JSON payload from stdin, writes to ~/.repo-orch/events/UUID.json
# via a dotfile then atomic rename so the watcher never sees a partial file.
set -eu
DIR="$HOME/.repo-orch/events"
mkdir -p "$DIR"
ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || printf '%s_%s' "$(date +%s)" "$$")
cat > "$DIR/.$ID.json"
mv "$DIR/.$ID.json" "$DIR/$ID.json"
