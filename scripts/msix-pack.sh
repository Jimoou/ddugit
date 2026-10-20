#!/usr/bin/env bash
# Packs the Microsoft Store .msix on Windows (Git Bash): lays out the package (scripts/msix.mjs),
# indexes its assets into resources.pri, then packs it. Without resources.pri Windows can't pick
# the scaled and unplated icon variants and draws the icon small on an accent-coloured plate.
# `scripts/msix-pack.sh <ddugit.exe> <out.msix> <identity name> <publisher> <publisher display name>`
set -euo pipefail

exe=$1 out=$2
layout=$(mktemp -d)
node "$(dirname "$0")/msix.mjs" "$exe" "$layout" "$3" "$4" "$5"

sdk=$(ls -d "/c/Program Files (x86)/Windows Kits/10/bin/"10.*/x64 | sort -V | tail -1)
config="$(dirname "$0")/msix-priconfig.xml"
w() { cygpath -w "$1"; }
# Git Bash would turn the /cf, /pr, /o … switches into paths.
export MSYS_NO_PATHCONV=1
"$sdk/makepri.exe" new /pr "$(w "$layout")" /cf "$(w "$config")" /mn "$(w "$layout/AppxManifest.xml")" \
  /of "$(w "$layout/resources.pri")" /o
mkdir -p "$(dirname "$out")"
"$sdk/makeappx.exe" pack /o /d "$(w "$layout")" /p "$(w "$out")"
echo "packed $out (layout $layout)"
