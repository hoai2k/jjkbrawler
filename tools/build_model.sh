#!/usr/bin/env bash
# Take one fighter from canon art to an approved model on both backends.
#
#     export TRIPO_API_KEY=tsk_...
#     export BLENDER=/path/to/blender
#     tools/build_model.sh gojo            # generate, then everything after
#     tools/build_model.sh gojo --local    # skip generation, reuse _raw.glb
#
# Every step here already existed; what did not exist was the ORDER, which is
# not obvious and is wrong in two places if you guess it:
#
#   * IMPORT RUNS TWICE. blender_author_clips.py scales its hip drops by the
#     fighter's height, and it reads that height from the MANIFEST — because
#     measuring the rig in rest reports nonsense on a bind pose that differs
#     from rest (2.73 m for a 1.73 m fighter). So the model has to be imported
#     once, unclipped, purely to record its height, before clips can be
#     authored against it.
#
#   * --face-fix IS ALWAYS PASSED. It is conditional inside the tool now
#     (measured off the rig's own spine), so passing it can only correct a
#     backwards rig, never turn a correct one around. Guessing per character
#     is how a fighter ships showing the camera their back.
#
# Failure stops the run: a half-imported fighter that still says `approved`
# is worse than one that never imported.
set -euo pipefail

CHAR="${1:-}"
[ -n "$CHAR" ] || { echo "usage: build_model.sh <char> [--local]"; exit 2; }
LOCAL=""
[ "${2:-}" = "--local" ] && LOCAL=1

cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-blender}"
RAW="billboards/intake/$CHAR/_raw.glb"
GLB="billboards/intake/$CHAR/$CHAR.glb"

step() { printf '\n=== %s: %s\n' "$CHAR" "$1"; }

if [ -z "$LOCAL" ]; then
  step "generate + rig (Tripo)"
  node tools/tripo_generate.mjs "$CHAR"
else
  [ -f "$RAW" ] || { echo "no $RAW to reuse"; exit 1; }
fi

# Blender's output goes to a file and is filtered afterwards, NOT piped
# straight into grep. Piping hides the exit status behind grep's, and `|| true`
# on top of that hid it twice: a conform that died on a NameError printed a
# traceback nobody grepped for, left the PREVIOUS .glb sitting where the new
# one should be, and the run went on to "approve" it. A build that reports
# success for a step that crashed is worse than one that stops.
run_blender() {
  local script="$1"; shift
  local log; log=$(mktemp)
  if ! "$BLENDER" --background --python "$script" -- "$@" >"$log" 2>&1; then
    echo "--- $script FAILED:"; tail -25 "$log"; rm -f "$log"; return 1
  fi
  grep -E "renamed|scaled|hook|rescue|hair chain|pruned|palette|STILL MISSING|authoring|did not take|wrote" "$log" || true
  rm -f "$log"
}

step "conform"
run_blender tools/blender_conform.py --in "$RAW" --out "$GLB" --char "$CHAR"

step "import once, for the height the clip author needs"
node tools/billboard_intake.mjs import "$CHAR" >/dev/null

step "author clips"
run_blender tools/blender_author_clips.py --in "$GLB" --out "$GLB" --char "$CHAR" --face-fix

step "validate, import and approve — billboards"
node tools/billboard_intake.mjs validate "$CHAR" 2>&1 | grep -E "^(ok|FAIL|warn.*MISSING)" || true
node tools/billboard_intake.mjs import "$CHAR" >/dev/null
node tools/billboard_intake.mjs approve "$CHAR"

step "same model, render3d"
mkdir -p "render3d/intake/$CHAR"
cp "$GLB" "render3d/intake/$CHAR/$CHAR.glb"
node tools/billboard_intake.mjs import "$CHAR" --backend 3d >/dev/null
node tools/billboard_intake.mjs approve "$CHAR" --backend 3d

printf '\n=== %s: done — review with\n    node tools/shot_workbench.mjs %s idle run sideHeavy\n' "$CHAR" "$CHAR"
