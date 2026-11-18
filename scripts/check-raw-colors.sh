#!/usr/bin/env bash
# Spec 0003 invariant: only tokens style components. Fails if raw colors appear in
# src/components/ or src/app/ (token definitions in globals.css are exempt).
set -euo pipefail

pattern='#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(|\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(-[0-9]{2,3})?\b'

if grep -rnE --include='*.ts' --include='*.tsx' --include='*.css' "$pattern" src/components src/app --exclude=globals.css; then
  echo "::error::Raw colors found. Use the tokens from DESIGN.md (bg-primary, text-muted-foreground, ...)."
  exit 1
fi
echo "No raw colors."
