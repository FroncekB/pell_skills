---
description: Deprecated alias for /pell:four-pass-review — the PR composite was renamed when the test-coverage pass became default-on. Prints a one-line notice, then forwards all arguments to /pell:four-pass-review unchanged. Will be removed in a future release.
argument-hint: <PR url | repo#number | bare PR number>
---

You are running **`/pell:three-pass-review`**, a deprecated alias. The PR composite was renamed to `/pell:four-pass-review` when the test-coverage pass became a default member of the review. This file exists so a saved command or old habit doesn't land on a dead slash command mid-review.

The user passed: `$ARGUMENTS`

## Step 1 — Print the rename notice

Print exactly one line, then continue without waiting:

`/pell:three-pass-review` was renamed to `/pell:four-pass-review`. Forwarding.

## Step 2 — Forward

Invoke `/pell:four-pass-review $ARGUMENTS` via the Skill tool, passing `$ARGUMENTS` through verbatim. Do no review work here — the new command owns argument parsing, the context-source override, the `skip tests` opt-out, WIP detection, Jira lookup, reviewer dispatch, and every side-effect gate.

## Operator notes

- This alias will be removed in a future release. Update saved commands to `/pell:four-pass-review`.
- Nothing here posts to Bitbucket or Jira. Every side effect belongs to the forwarded command and stays gated there.
