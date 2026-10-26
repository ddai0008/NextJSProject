#!/usr/bin/env bash
# Install the Node.js version pinned in .nvmrc into ~/.local, checked against nodejs.org's SHASUMS256.txt.
# No sudo and no shell-profile changes; scripts/use-node.sh puts it on PATH.
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
trap 'rm -rf "$tmp"' EXIT

curl -fsSL -o "$tmp/$name.tar.xz" "https://nodejs.org/dist/v${version}/${name}.tar.xz"
curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v${version}/SHASUMS256.txt"
(cd "$tmp" && grep " ${name}.tar.xz\$" SHASUMS256.txt | sha256sum -c -)

mkdir -p "$HOME/.local"
tar -xJf "$tmp/$name.tar.xz" -C "$HOME/.local"
echo "Installed Node $version at $dest"
echo "Use it in this shell with: source scripts/use-node.sh"
