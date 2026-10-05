#!/usr/bin/env bash
# Tag a release of the whole repo: bash scripts/release.sh 0.2.0
#
# Apps install a package straight from a tag, with no build of their own, so a
# tag is only good if the dist/ inside it is exactly what src/ compiles to.
# This rebuilds every package, runs the checks, and refuses to tag if the
# rebuild changed anything (commit the rebuilt dist/ and run it again).
set -euo pipefail

version="${1:?usage: scripts/release.sh <version>  (e.g. 0.2.0)}"
tag="v${version}"
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "release: the working tree is dirty — commit or stash first" >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "release: ${tag} already exists — never re-tag a published version" >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build

if [ -n "$(git status --porcelain)" ]; then
  echo "release: dist/ was stale — the rebuild changed:" >&2
  git status --short >&2
  echo "commit the rebuilt dist/ and run this again" >&2
  exit 1
fi

git tag -a "${tag}" -m "${tag}"
git push origin HEAD "${tag}"
echo "released ${tag}"
