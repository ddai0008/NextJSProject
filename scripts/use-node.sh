# Source this file (do not execute it): `source scripts/use-node.sh`
# Puts the Node.js version pinned in .nvmrc first on PATH. CI reads the same file (actions/setup-node node-version-file).
_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_version="$(tr -d 'v[:space:]' < "$_root/.nvmrc")"
case "$(uname -m)" in aarch64 | arm64) _arch=arm64 ;; *) _arch=x64 ;; esac
_bin="$HOME/.local/node-v${_version}-linux-${_arch}/bin"

if [ -x "$_bin/node" ]; then
  export PATH="$_bin:$PATH"
  _status=0
else
  echo "Node $_version is not installed. Run: scripts/install-node.sh" >&2
  _status=1
fi

unset _root _version _arch _bin
return "$_status" 2>/dev/null || exit "$_status"
