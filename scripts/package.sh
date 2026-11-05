#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/package-common.sh"
package_common_init chat "$@"
command -v npm >/dev/null 2>&1 || package_fail 'npm is required'
(cd "$PACKAGE_ROOT_DIR" && HUSKY=0 npm install --no-audit --no-fund && BUILD_VERSION="$PACKAGE_VERSION" BUILD_MODE=standalone BUILD_APP=0 npm run build)
[[ -f "$PACKAGE_ROOT_DIR/.next/standalone/server.js" ]] || package_fail 'standalone Next.js server output is missing'
package_make_root chat
cp -R "$PACKAGE_ROOT_DIR/.next/standalone/." "$PACKAGE_DIR/"
mkdir -p "$PACKAGE_DIR/.next" "$PACKAGE_DIR/scripts"
[[ ! -d "$PACKAGE_ROOT_DIR/.next/static" ]] || cp -R "$PACKAGE_ROOT_DIR/.next/static" "$PACKAGE_DIR/.next/static"
[[ ! -d "$PACKAGE_ROOT_DIR/public" ]] || cp -R "$PACKAGE_ROOT_DIR/public" "$PACKAGE_DIR/public"
for file in .env.template .env.build.template; do [[ ! -f "$PACKAGE_ROOT_DIR/$file" ]] || cp "$PACKAGE_ROOT_DIR/$file" "$PACKAGE_DIR/"; done
for file in starter.sh health-check.sh test.sh upgrade.sh backup.conf.template config_backup.sh .passphrase-file.template; do [[ ! -f "$PACKAGE_ROOT_DIR/scripts/$file" ]] || install -m 0755 "$PACKAGE_ROOT_DIR/scripts/$file" "$PACKAGE_DIR/scripts/$file"; done
package_finish_artifact service
package_finish
