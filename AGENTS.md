# Anvil Ops — agent notes

## Pushing to GitHub

Repository: <https://github.com/MelroseSaint/CRM> (default branch `main`, remote `origin` kept as
`https://github.com/MelroseSaint/CRM.git`).

The credential is the GitHub account connected to this project (`MelroseSaint`). Pushing is expected
to work from the chat with no action from the user. Never ask the user for a personal access token,
project secret, password or SSH key, and never write a credential into the repository, a config file
or a shell script. The sandbox normally has no stored git credential, so a bare `git push` from a
shell will prompt and fail; use the procedure below instead.

1. Generate a throwaway key pair (this exact pair is created for one push and then destroyed):

   ```bash
   rm -f ~/.ssh/anvil_push ~/.ssh/anvil_push.pub
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   ssh-keygen -t ed25519 -N '' -C 'anvil-ops-push' -f ~/.ssh/anvil_push >/dev/null
   chmod 600 ~/.ssh/anvil_push
   cat ~/.ssh/anvil_push.pub
   ```

2. Create a write-enabled deploy key with the integration tool `GITHUB_CREATE_A_DEPLOY_KEY`
   (`owner: MelroseSaint`, `repo: CRM`, `read_only: false`, title `Anvil Ops push (temporary)`,
   `key:` the contents of `~/.ssh/anvil_push.pub`). Keep the returned `id`.

3. Push over SSH on port 443, leaving `origin` untouched as HTTPS:

   ```bash
   git -c core.sshCommand="ssh -i $HOME/.ssh/anvil_push -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -p 443 git@ssh.github.com" \
     push origin HEAD:main
   ```

4. Verify, then clean up immediately:

   ```bash
   git ls-remote https://github.com/MelroseSaint/CRM.git refs/heads/main
   git rev-parse HEAD
   rm -f ~/.ssh/anvil_push ~/.ssh/anvil_push.pub
   ```

   The two SHAs must match. Delete the deploy key with `GITHUB_DELETE_DEPLOY_KEY` (`key_id` from
   step 2) and confirm with `GITHUB_LIST_DEPLOY_KEYS` that the list is empty. No key material or
   credential may remain in the workspace afterwards.

`--force-with-lease` is only acceptable for the very first import of an empty repository; never
rewrite history that has already been pushed. If the GitHub integration is unavailable, say so
plainly rather than asking the user for a credential.
