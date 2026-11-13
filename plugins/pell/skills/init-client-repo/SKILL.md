---
name: init-client-repo
description: Use when the user gives a Bitbucket repository link for a new client project and asks to initialize, set up or start it from the Pell Web App Framework — "here's the repo for the next client", "initialize this client repo", "fork the framework for <client>".
---

# Pell Init Client Repo Router

The user wants a new client's Bitbucket repo started from the Pell Web App Framework. `/pell:init-client-repo` does that whole job: it forks the framework into a fresh clone, runs and checks it, and pushes `main` and `staging`. This skill only decides whether the request is that job and hands it over.

## Step 1 — Decide whether this skill actually applies

Apply it when both hold:

- The user gave a Bitbucket repository link (`https://bitbucket.org/<workspace>/<repo>` or `git@ssh.bitbucket.org:<workspace>/<repo>.git`, or the older `git@bitbucket.org:<workspace>/<repo>.git`) in the same request.
- They want that repo initialized, set up or started as a client project from the Pell Web App Framework.

Skip it, and say so in one short sentence, when the link is given for anything else:

- Reviewing or addressing a pull request (`/pell:four-pass-review`, `/pell:address-review`)
- Mapping an existing repo's coordinates (`/pell:map-repo`)
- Reading a file, a commit or a branch in the repo
- Starting work on a ticket in a repo that already exists (`/pell:start-work`)
- Questions about the framework itself, or a client repo that is already initialized

If it is unclear which one the user means, ask once before invoking anything.

## Step 2 — Invoke the command

Say "New client repo detected — handing off to `/pell:init-client-repo`." Then invoke it with the Skill tool, passing the user's words as the arguments: the link, any name, logo or framework branch they gave, and `--dry-run` if they asked for a preview.

## Step 3 — Step aside

This skill is a router, not a workflow. Its job ends once the command is running. It never clones, creates a repo, forks, commits or pushes; the command does all of that and gates each step with its own prompt.

## Operator notes

- **Never** do the work in this skill, and never answer the command's prompts for the user.
- **Never** invoke the command on a link the user supplied for another purpose; ask first.
- If `/pell:init-client-repo` isn't available, say so and stop. Don't improvise the steps.
