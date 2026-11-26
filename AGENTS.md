# Anvil Ops — agent notes

## Pushing to GitHub

Repository: <https://github.com/MelroseSaint/CRM> (default branch `main`, remote `origin` kept as
`https://github.com/MelroseSaint/CRM.git`).

The credential is the GitHub account connected to this project (`MelroseSaint`). Pushing is expected
to work from the chat with no action from the user. Never ask the user for a personal access token,
project secret, password or SSH key, and never write a credential into the repository, a config file
or a shell script. The sandbox normally has no stored git credential, so a bare `git push` from a
shell will prompt and fail; use the procedure below instead.

Temporary deploy keys are the one thing that can be left behind, so every push is wrapped in a
sweep. A push that fails after the key was created still leaves a write-enabled key on the
repository; sweeping before and after means the next attempt cleans it up even if the previous one
died halfway.

### Before the push — sweep stale keys

1. Call `GITHUB_LIST_DEPLOY_KEYS` (`owner: MelroseSaint`, `repo: CRM`).
2. For **every** key whose title is exactly `Anvil Ops push (temporary)`, call
   `GITHUB_DELETE_DEPLOY_KEY` with its `id` — not only keys left by this session. This clears keys
   orphaned by earlier failed pushes.
3. Re-list and confirm no key with that title remains. If a deletion fails, stop and report it
   instead of pushing, so the repository does not accumulate write access.

### Push

4. Generate a throwaway key pair:

   ```bash
   rm -f ~/.ssh/anvil_push ~/.ssh/anvil_push.pub
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   ssh-keygen -t ed25519 -N '' -C 'anvil-ops-push' -f ~/.ssh/anvil_push >/dev/null
   chmod 600 ~/.ssh/anvil_push
   cat ~/.ssh/anvil_push.pub
   ```

5. Create a write-enabled deploy key with `GITHUB_CREATE_A_DEPLOY_KEY` (`owner: MelroseSaint`,
   `repo: CRM`, `read_only: false`, title `Anvil Ops push (temporary)`, `key:` the contents of
   `~/.ssh/anvil_push.pub`). Keep the returned `id`.

6. Push over SSH on port 443, leaving `origin` untouched as HTTPS. The destination must be given
   explicitly as an SSH URL — `core.sshCommand` does not rewrite an HTTPS remote:

   ```bash
   git -c core.sshCommand="ssh -i $HOME/.ssh/anvil_push -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -p 443" \
     push git@ssh.github.com:MelroseSaint/CRM.git HEAD:main
   ```

7. Verify the result:

   ```bash
   git ls-remote https://github.com/MelroseSaint/CRM.git refs/heads/main
   git rev-parse HEAD
   ```

   The two SHAs must match.

### After the push — sweep again, even on failure

8. Whether the push succeeded or failed, call `GITHUB_LIST_DEPLOY_KEYS` and delete **every** key
   titled `Anvil Ops push (temporary)`, including the one just created and anything that appeared
   during the push. Re-list and confirm the title appears zero times.
9. Remove the local key material:

   ```bash
   rm -f ~/.ssh/anvil_push ~/.ssh/anvil_push.pub
   ```

10. If a key could not be deleted, say so explicitly in the final message rather than reporting a
    clean finish. A surviving `Anvil Ops push (temporary)` key is a write credential on the
    repository and must be treated as an incident, not a cosmetic leftover.

`--force-with-lease` is only acceptable for the very first import of an empty repository; never
rewrite history that has already been pushed. If the GitHub integration is unavailable, say so
plainly rather than asking the user for a credential.
