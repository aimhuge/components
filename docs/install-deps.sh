#!/usr/bin/env bash
# Install dependencies, including the private @aimhuge/* packages.
#
# Vercel runs this as the install command (vercel.json "installCommand") and CI
# runs it in place of `pnpm install`; extra arguments go straight to pnpm.
#
# @aimhuge/* packages come from the private aimhuge/components repo over SSH,
# and a build can't clone another private repo on its own. So a read-only
# deploy key for that one repo rides in AIMHUGE_COMPONENTS_DEPLOY_KEY, and git
# uses it through GIT_SSH_COMMAND for this install only. Unset (a laptop), the
# developer's own SSH key does the job and this is plain `pnpm install`.
#
# Canonical copy: aimhuge/components docs/install-deps.sh.
set -euo pipefail

if [ -n "${AIMHUGE_COMPONENTS_DEPLOY_KEY:-}" ]; then
  # Vercel's build image doesn't promise an SSH client; GitHub's runners have one.
  command -v ssh >/dev/null 2>&1 || dnf install -y -q openssh-clients

  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' EXIT
  printf '%s\n' "$AIMHUGE_COMPONENTS_DEPLOY_KEY" > "$dir/key"
  chmod 600 "$dir/key"
  # GitHub's published ed25519 host key, pinned rather than trusted on first use:
  # https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
  echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > "$dir/known_hosts"
  export GIT_SSH_COMMAND="ssh -i $dir/key -o IdentitiesOnly=yes -o UserKnownHostsFile=$dir/known_hosts -o StrictHostKeyChecking=yes"
fi

pnpm install "$@"
