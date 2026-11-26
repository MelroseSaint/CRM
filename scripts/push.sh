#!/usr/bin/env bash
# Push to MelroseSaint/CRM using the GitHub token supplied by the environment.
#
# The token is never written to disk: it is handed to git through an askpass
# helper that reads GITHUB_TOKEN at call time. Store the token as the project
# secret GITHUB_TOKEN (Settings -> Project settings -> Secrets) so it is
# available in every chat and after the sandbox is rebuilt.
#
# Usage: npm run push [-- <git push args>]
set -euo pipefail

EXPECTED_REMOTE="https://github.com/MelroseSaint/CRM.git"

remote_url=$(git remote get-url origin 2>/dev/null || true)
if [ "$remote_url" != "$EXPECTED_REMOTE" ]; then
  echo "Refusing to push: origin is '${remote_url:-<unset>}', expected '$EXPECTED_REMOTE'." >&2
  echo "Run: git remote set-url origin $EXPECTED_REMOTE" >&2
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  cat >&2 <<'MESSAGE'
GITHUB_TOKEN is not set, so this workspace has no GitHub credential.

  1. Create a fine-grained token for MelroseSaint/CRM with Contents: Read and write:
       https://github.com/settings/personal-access-tokens/new
  2. Save it as the project secret named GITHUB_TOKEN:
       Settings -> Project settings -> Secrets
  3. Re-run: npm run push

To revoke access later: delete the token on that same GitHub page (it stops
working immediately), then delete the GITHUB_TOKEN secret in project settings.
MESSAGE
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
export GIT_ASKPASS="$SCRIPT_DIR/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS_REQUIRE=force

if [ "$#" -eq 0 ]; then
  exec git push -u origin HEAD
fi

exec git push "$@"
