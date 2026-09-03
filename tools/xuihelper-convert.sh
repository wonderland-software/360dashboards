#!/bin/sh
# Batch-convert every .xur of a build with XUIHelper's CLI (the independent
# second parser the XUIDIFF check compares ours against).
#
#   tools/xuihelper-convert.sh <build>        # extracted/<build>/xuiz -> extracted/<build>/xuihelper/<pack>/<scene>.xui
#
# Needs vendor/xuihelper-cli (XUIHelper.CLI built for net10.0, see LEARNINGS
# "XUIHelper's CLI on macOS") and the Homebrew dotnet. Paths must be absolute
# and the group is the extension directory name, not a build number: V5 for
# the XUR v5 builds (6770, 9199), V8 for Metro 17559.
# Scenes XUIHelper refuses are listed at the end; xur2xui --diff reports them
# as "no XUIHelper output" rather than as parser differences, so a refusal
# here can never make the diff pass by accident.
set -u
build="${1:?usage: tools/xuihelper-convert.sh <build>}"
case "$build" in 17559) group=V8 ;; *) group=V5 ;; esac
root="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/dotnet/bin:$PATH"
cli="$root/vendor/xuihelper-cli/XUIHelper.CLI.dll"
in="$root/extracted/$build/xuiz"
out="$root/extracted/$build/xuihelper"
[ -f "$cli" ] || { echo "XUIHELPER_FAIL $cli is not built"; exit 1; }
[ -d "$in" ] || { echo "XUIHELPER_FAIL $in does not exist; run npm run extract -- --build $build"; exit 1; }
ok=0; bad=0; failed=""
for xur in $(cd "$in" && find . -name '*.xur' | sort); do
  rel="${xur#./}"
  dst="$out/${rel%.xur}.xui"
  mkdir -p "$(dirname "$dst")"
  if dotnet "$cli" conv -s "$in/$rel" -f xuiv12 -o "$dst" -g "$group" >/dev/null 2>&1 && [ -s "$dst" ]; then
    ok=$((ok + 1))
  else
    bad=$((bad + 1)); failed="$failed $rel"; rm -f "$dst"
  fi
done
for f in $failed; do echo "  refused $f"; done
echo "XUIHELPER_DONE $ok converted, $bad refused (build $build, group $group)"
