#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRIALS_DIR="$SCRIPT_DIR/trials"
MAX_TURNS="${MAX_TURNS:-50}"
MODEL="${MODEL:-sonnet}"

# ── Determine which trials to run ─────────────────────────────
if [ $# -gt 0 ]; then
  TRIALS=("$@")
else
  TRIALS=($(ls -d "$TRIALS_DIR"/t* | xargs -n1 basename | sort))
fi

echo "==> Trials to run: ${TRIALS[*]}"
echo "==> Model: $MODEL"
echo "==> Max turns: $MAX_TURNS"
echo ""

# ── Run each trial ────────────────────────────────────────────
for trial in "${TRIALS[@]}"; do
  TRIAL_DIR="$TRIALS_DIR/$trial"
  PROMPT_FILE="$TRIAL_DIR/prompt.md"

  if [ ! -f "$PROMPT_FILE" ]; then
    echo "WARNING: $PROMPT_FILE not found, skipping."
    continue
  fi

  # Output dir inside the trial folder
  OUTPUT_DIR="$TRIAL_DIR/output"
  mkdir -p "$OUTPUT_DIR"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Running trial: $trial"
  echo "  Prompt: $PROMPT_FILE"
  echo "  Output: $OUTPUT_DIR"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Run Claude Code in the output directory
  # --output-format stream-json: detailed JSON log of every tool call and response
  # --verbose: required for stream-json
  # tee saves the full JSON stream; terminal shows progress
  START_TIME=$(date +%s)
  (cd "$OUTPUT_DIR" && claude --print --verbose \
    --model "$MODEL" \
    --max-turns "$MAX_TURNS" \
    --dangerously-skip-permissions \
    --output-format stream-json \
    -p "$(cat "$PROMPT_FILE")

---

## IMPORTANT: OSM Querying Guidelines

- To query the whole Manhattan island, you should **only** use \`areas: ['Manhattan Island']\`. Do not use broader areas like 'New York' or 'Manhattan' alone, as they may return data outside the island boundary.
- Be careful with OSM / Overpass API requests — the API has strict rate limits and you can easily get **HTTP 429 (Too Many Requests)** errors. To avoid this:
  - Minimize the number of Overpass queries by combining multiple element types into a single query where possible.
  - Cache or reuse responses instead of re-fetching the same data.
  - Add appropriate delays between sequential requests if multiple queries are unavoidable.
  - If you receive a 429 error, wait before retrying (use exponential backoff).

---

## IMPORTANT: Console Logging

All major operations must be logged to the browser console using \`console.log\`. This includes but is not limited to:
- Data loading (e.g., \"Loading OSM layers...\", \"OSM buildings loaded: 12345 features\")
- API requests and responses (e.g., \"Fetching Overpass API...\", \"Overpass response received: 2.3 MB\")
- Data processing steps (e.g., \"Spatial join started...\", \"Spatial join complete: 8000 buildings matched\")
- Rendering milestones (e.g., \"Initializing renderer...\", \"Scene rendered with 5 layers\")
- Errors and warnings with relevant context

Each log message should be descriptive enough to trace the application's progress and diagnose issues from the console alone.

---

## IMPORTANT: Validation Requirements

After generating the project, you MUST validate that it fully works by following these steps:

1. Install all dependencies (npm install or equivalent). Fix any install errors.
2. Run the TypeScript compiler (npx tsc --noEmit) and fix ALL type errors.
3. Run the production build (npm run build or npx vite build). Fix any build errors.
4. Start the dev server in the background (e.g., npm run dev &).
5. Wait a few seconds, then use curl to fetch the main page (e.g., curl -s http://localhost:3005) and verify it returns valid HTML.
6. Use curl to check that the JavaScript bundle loads without errors (e.g., curl -s http://localhost:3005/src/main.ts or the built entry point).
7. Review the application code end-to-end: check that all imports resolve, all APIs are called correctly, and all data flows are connected.
8. If ANY step fails, debug the root cause, fix it, and repeat from step 2.
9. Kill the dev server when done (kill any background node processes).
10. Do NOT stop until you have a system that compiles, builds, serves, and has no obvious runtime errors. If you exhaust all reasonable fixes, document what remains broken." \
    2>&1 | tee "$TRIAL_DIR/log.jsonl")
  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))
  MINUTES=$((ELAPSED / 60))
  SECONDS=$((ELAPSED % 60))

  echo "{\"trial\": \"$trial\", \"model\": \"$MODEL\", \"max_turns\": $MAX_TURNS, \"duration_seconds\": $ELAPSED, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$TRIAL_DIR/meta.json"

  echo ""
  echo "==> Trial $trial complete in ${MINUTES}m ${SECONDS}s. Output in $OUTPUT_DIR"
  echo ""
done

echo "==> All trials finished."
