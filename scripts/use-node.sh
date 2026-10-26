# Source this file (do not execute it): `source scripts/use-node.sh`
# Puts the Node.js version pinned in .nvmrc first on PATH. CI reads the same file (actions/setup-node node-version-file).
# Bash only (it locates itself with BASH_SOURCE); bash is the WSL default shell.
_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_version="$(tr -d 'v[:space:]' < "$_root/.nvmrc")"
case "$(uname -m)" in aarch64 | arm64) _arch=arm64 ;; *) _arch=x64 ;; esac
_bin="$HOME/.local/node-v${_version}-linux-${_arch}/bin"

if [ -x "$_bin/node" ]; then
  export PATH="$_bin:$PATH"
  unset _root _version _arch _bin
  return 0 2>/dev/null || exit 0
else
  echo "Node $_version is not installed. Run: scripts/install-node.sh" >&2
  unset _root _version _arch _bin
  return 1 2>/dev/null || exit 1
fi
