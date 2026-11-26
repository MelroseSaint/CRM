#!/bin/sh
# Prints GitHub credentials for git when GITHUB_TOKEN is present in the
# environment. Invoked by scripts/push.sh through GIT_ASKPASS; it never writes
# the token anywhere and never prints it except to git's credential prompt.
case "$1" in
  *Username*) printf '%s\n' "${GIT_PUSH_USERNAME:-x-access-token}" ;;
  *Password*) printf '%s\n' "${GITHUB_TOKEN:-}" ;;
  *) : ;;
esac
