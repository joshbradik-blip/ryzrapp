#!/usr/bin/env bash
# Quick quality test for Perfect Corp / YouCam "AI Body Reshape" — hits the API
# directly (no Supabase deploy needed) so you can spend one free credit and see
# whether the "leaner" result looks believable before we build any app UI.
#
# Usage:
#   PERFECTCORP_API_KEY=xxxxx ./scripts/test-body-reshape.sh [IMAGE_URL]
#
# IMAGE_URL must be a PUBLIC full-body photo (long side <= 2048, short side
# >= 320, < 10MB, jpg/png), with both arms and legs fully visible, no raised
# hand, no 90-degree side pose. Defaults to Perfect Corp's own sample image.
#
# Requires: curl, jq.

set -euo pipefail

BASE="https://yce-api-01.makeupar.com"
KEY="${PERFECTCORP_API_KEY:?Set PERFECTCORP_API_KEY to your YouCam API key}"
IMG="${1:-https://plugins-media.makeupar.com/strapi/assets/body_reshape_02_7777218379.jpg}"

echo "→ Creating reshape task for: $IMG"

# A moderate, realistic "leaner" preset — narrow waist, flatter belly, slimmer
# frame, slightly broader shoulders. Tweak to taste.
CREATE=$(curl -sS -X POST "$BASE/s2s/v2.0/task/body-reshape" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{
  "src_file_url": "$IMG",
  "version": "1.0",
  "index": 0,
  "features": { "waist": -20, "belly": -50, "slim": -40, "arm": -10, "shoulder_left": 15, "shoulder_right": 15 }
}
JSON
)")

echo "$CREATE" | jq .

TASK_ID=$(echo "$CREATE" | jq -r '.. | .task_id? // .result_id? // empty' | head -n1)
if [ -z "$TASK_ID" ]; then
  echo "✗ No task_id in response — check the error above." >&2
  exit 1
fi
echo "→ task_id: $TASK_ID  (polling…)"

for i in $(seq 1 30); do
  sleep 2
  POLL=$(curl -sS "$BASE/s2s/v2.0/task/body-reshape/$TASK_ID" -H "Authorization: Bearer $KEY")
  STATUS=$(echo "$POLL" | jq -r '.. | .task_status? // empty' | head -n1)
  echo "   [$i] status: ${STATUS:-<none>}"
  case "$STATUS" in
    success)
      echo "✓ Done. Result:"
      echo "$POLL" | jq '.. | .results? // .result? // empty'
      exit 0 ;;
    error|failed)
      echo "✗ Task failed:" >&2
      echo "$POLL" | jq . >&2
      exit 1 ;;
  esac
done

echo "✗ Timed out waiting for the task." >&2
exit 1
