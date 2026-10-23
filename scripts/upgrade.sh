#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 3 ]]; then
  printf 'Usage: %s <prepare|copy-config|post-copy|finalize> <current-dir> <target-dir>\n' "$0" >&2
  exit 1
fi

case "$1" in
  prepare|post-copy|finalize) exit 0 ;;
  copy-config)
    current_dir=$2
    target_dir=$3
    [[ -f "${current_dir}/.env" ]] || { printf 'Source config file not found: %s/.env\n' "$current_dir" >&2; exit 1; }
    [[ -d "$target_dir" ]] || { printf 'Target directory not found: %s\n' "$target_dir" >&2; exit 1; }
    cp "${current_dir}/.env" "${target_dir}/.env"
    ;;
  *)
    printf 'Unsupported upgrade phase: %s\n' "$1" >&2
    exit 1
    ;;
esac
