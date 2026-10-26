#!/usr/bin/env bash
# Install the Node.js version pinned in .nvmrc into ~/.local. No sudo and no shell-profile changes; scripts/use-node.sh puts it on PATH.
# The tarball is checked against nodejs.org's SHASUMS256.txt. That file comes from the same host as the tarball, so this catches a
# corrupted download, not a tampered one (the GPG signature is not checked).
# The tarball is unpacked into a staging directory and renamed into place, so an interrupted run never leaves a half-installed tree
# that the "already installed" check would accept.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(tr -d 'v[:space:]' < "$root/.nvmrc")"

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

name="node-v${version}-linux-${arch}"
dest="$HOME/.local/$name"

if [ -x "$dest/bin/node" ]; then
  echo "Node $version is already installed at $dest"
  exit 0
fi

tmp="$(mktemp -d)"
partial="$HOME/.local/.${name}.partial"
trap 'rm -rf "$tmp" "$partial"' EXIT

curl -fsSL -o "$tmp/$name.tar.xz" "https://nodejs.org/dist/v${version}/${name}.tar.xz"
curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v${version}/SHASUMS256.txt"
(cd "$tmp" && grep " ${name}.tar.xz\$" SHASUMS256.txt | sha256sum -c -)

mkdir -p "$HOME/.local"
rm -rf "$partial" "$dest"
mkdir "$partial"
tar -xJf "$tmp/$name.tar.xz" -C "$partial"
mv "$partial/$name" "$dest"
echo "Installed Node $version at $dest"
echo "Use it in this shell with: source scripts/use-node.sh"
