---
description: "Start a client project from the Pell Web App Framework: clone the client's Bitbucket repo, fork the framework into it under the client's name, run it locally, check it, and push main and staging. Read-only until you confirm the plan."
argument-hint: "<bitbucket repo link> [name \"<display name>\"] [logo <path>] [ref <framework branch>] [--dry-run] [--reset]"
---

You are running **`/pell:init-client-repo`**. It turns a client's Bitbucket repo link into that repo holding the Pell Web App Framework under the client's name: forked by the framework's own tool from a fresh clone, running locally with the client's name on the sign-in page, checked, committed on `main`, branched to `staging`, and pushed. It is read-only until the engineer confirms the plan in Step 6. Before that, the only writes are the two it asks for by name: saving the repos folder (Step 3) and creating the repo (Step 4).

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Work through `$ARGUMENTS` in this order, stripping each recognized token as you go.

1. **Modifiers** (case-insensitive): `--dry-run`, `--reset`.
   - `--dry-run` → `dry_run = true`. A dry run has no side effect beyond a temporary framework clone it deletes: it never saves the config, creates the repo or clones the client repo. It runs `--names-only`, prints the plan, and stops. A check that would stop a real run before the plan (a busy port, no SQL Server, an existing folder, a missing repo) prints its line, and the dry run goes on to the plan.
   - `--reset` → `reset = true` (Step 3). If both appear, `--dry-run` wins: print `Both "--dry-run" and "--reset" were given — --dry-run wins; the saved repos folder is left alone.`
2. **The link**: `https://bitbucket.org/<ws>/<slug>` (also with a `user@` before the host, a trailing `/` or `.git`, or more path such as `/src/main/`) or `git@ssh.bitbucket.org:<ws>/<slug>.git`, or the older `git@bitbucket.org:<ws>/<slug>.git`. First drop trailing sentence punctuation from the link (`.`, `,`, `;`, `:`, `!`, `?`, `)` and closing quotes, repeatedly, so `https://bitbucket.org/<ws>/<slug>.` or `"<link>",` becomes the bare link). Then take the workspace and slug from the first two path segments, without `.git`. Each must match `^[A-Za-z0-9._-]+$` and not start with `-`; if either doesn't, say so and ask for the link again. With no link, ask: `> Which Bitbucket repository is this client's? Paste its link.` Whichever form is given, every git command below uses `git@ssh.bitbucket.org:<ws>/<slug>.git`. When `--reset` is the only argument, do Step 3's reset and stop instead.
3. **`name "<display>"`** → `display`, the client's name as users read it.
4. **`logo <path>`** → `logo`. Check that the file exists and ends in `.svg`, `.png` or `.webp`, and make the path absolute (relative to the folder you run in). If it fails the check, say so; Step 6 asks again.
5. **`ref <branch>`**, or a phrase naming a framework branch (`from the framework's <branch> branch`) → `ref`. Default `react`. It must match `^[A-Za-z0-9._/-]+$` (a branch name may hold `/`) and not start with `-`; otherwise ask for it again.
6. The rest is context. A name form given in words (`code AcmeOps`, `lower acmeops`, `env ACMEOPS`) is an override passed to the tool in Step 6.

No workspace, slug, ref or path goes into a shell command before it passes its check.

Run `date +%s` and record it as `t_start`. Set `waited = 0`. From here on, for every question to the engineer, run `date +%s` just before asking and again first thing after the answer, and add the difference to `waited`.

Shell conventions for every step:
- Run shell steps with the Bash tool (Git Bash on Windows). Each call starts a fresh shell, so carry the folders, names and times yourself. Windows means `uname -s` starts with `MINGW`, `MSYS` or `CYGWIN`.
- "From `<folder>`" means each call starts with `cd '<folder>' &&`.
- Quote a value for the shell in single quotes, each `'` written as `'\''`. A display such as `Acme & Field Ops` or `Pat's Field Ops` holds characters the shell would otherwise read.
- On Windows, write paths as `C:/Users/...` (`cygpath -m` converts a Git Bash path), which Git Bash and `dotnet` both read.
- **Background jobs.** A step that runs `<job>` in the background starts it with the Bash tool's `run_in_background` option, in this shape, so its output and exit code land in `<temp>`:

  ```bash
  { <command>; } > '<temp>/<job>.log' 2>&1; echo $? > '<temp>/<job>.exit'
  ```

  Wait for it with the Bash tool's completion notice for that command. To wait without one, use one bounded loop, with a Bash timeout of 600000 ms, and run it again if it ends while the job is still going: `for i in $(seq 1 290); do [ -f '<temp>/<job>.exit' ] && break; sleep 2; done`. The job passed when `<temp>/<job>.exit` holds `0`. Otherwise it failed: show the last 40 lines of `<temp>/<job>.log`.
- **Stopping early.** When a step says to stop early, in this order:
  1. Stop the app if it is running (Step 9, item 5).
  2. If a background job is still running, wait for it to exit: never delete `<temp>` while one may still be writing.
  3. Delete `<temp>`.
  4. Print the step's message. If Step 7 cloned the client repo, add `<folder> is left for you to look at. Delete it before running again.` If Step 4 created the repo in this run, add `<ws>/<slug> was created and is still empty.`
  5. Add the times, in the same form as Step 12's report and in minutes to one decimal place: run `date +%s` for now. Once `t_running` is set (Step 9, item 4), add `To running <t_running - t_start> min, waiting <waited> min on you, <now - t_start> min elapsed so far, fork tool <s> s.` Before that, add `<now - t_start> min elapsed so far, <waited> min of that waiting on you.` Write no run-log line on a stop: the fork isn't committed.

## Step 2 — Prerequisites

Run `command -v git dotnet npm curl`. If one is missing, stop with: `<tool> isn't on the PATH. Install it as the framework's README describes, then run again.`

On macOS and Linux there is no LocalDB, so the fork needs `PELLFW_TEST_SQL`. Test it with `[ -n "${PELLFW_TEST_SQL:-}" ]`, never by printing it. If it isn't set, stop with: `The fork needs a SQL Server, and LocalDB is Windows-only. Set PELLFW_TEST_SQL (a database named PellFramework_Test, as the framework's README says) and PELLFW_TEST_ALLOW_REMOTE=1 in your environment, then run again in a new session.`

Ports 7143 and 5173 must be free: the fork runs on the framework's ports. Find any listener:
- Windows: `netstat -ano | awk '$4 == "LISTENING" && $2 ~ /:(7143|5173)$/ {print $2, $NF}'`, then name each PID with `tasklist //FI "PID eq <pid>" //FO CSV //NH`.
- macOS and Linux: `lsof -nP -iTCP:7143 -iTCP:5173 -sTCP:LISTEN`.

If either port is held, stop with: `Port <port> is in use by <process> (PID <pid>). Stop that app, then run again.`

Step 10's screenshot job needs its own ports (4301 and up for the app preview, 4401 and up for Storybook). It checks them just before it runs, not now; if another screens run is going, expect a wait there.

## Step 3 — The repos folder

Read `~/.claude/pell-config.json` (use the Read tool; if the file doesn't exist, treat it as `{}`).

If `reset` is set: when the file has an `init_client_repo` section, remove it with an atomic read-modify-write (re-read the file, delete only `init_client_repo`, write the result back) and print `Cleared the saved repos folder.`; otherwise print `Nothing to reset for /pell:init-client-repo.` Then continue as if no folder were saved.

If `init_client_repo.repos_folder` is set and the folder exists, use it and print `Repos folder: <folder>`. Otherwise ask:

> Which folder do your client repos live in? Say "default" for <the parent of the current folder>.

Then gate:

> Save <folder> as the folder for client repos? (y/n)

On `y`, atomically write it back:
1. Re-read the config (or use `{}` if it doesn't exist).
2. Set `init_client_repo.repos_folder = "<folder>"`, leaving every other section untouched.
3. Write the merged JSON back to `~/.claude/pell-config.json`.

On `n`, use the folder for this run only and print `Repos folder not saved.`

Under `--dry-run`, ask nothing: use the saved folder or the default, and print `--dry-run: repos folder not saved.` when a real run would have asked.

If `<repos folder>/<slug>` already exists, stop with: `<repos folder>/<slug> already exists. Move it or delete it, then run again.`

## Step 4 — The client repo

Run `git ls-remote git@ssh.bitbucket.org:<ws>/<slug>.git`.
- **Exit 0**: the repo exists. Print `<ws>/<slug> exists on Bitbucket.`
- **Git says the repository doesn't exist** (`repository does not exist`, `Repository not found`): the repo is missing, or you can't see it.
- **`Host key verification failed`**: this machine's `known_hosts` has no entry for `ssh.bitbucket.org`, and a non-interactive run can't answer git's prompt. Never accept a host key for the engineer and never edit `known_hosts`. Nothing has been cloned or created yet, so stop with the message in the block below.
- **Any other failure**, such as `Permission denied (publickey)` or a network error: stop with `git can't reach <ws>/<slug> on Bitbucket: <git's message>. Check your SSH key with ssh -T git@ssh.bitbucket.org, then run again.`

The host-key message, shared with Step 5's framework clone:

> This machine hasn't trusted Bitbucket's SSH host key yet. In your own terminal, run `ssh git@ssh.bitbucket.org host_key_info`. Check that the fingerprint it shows matches one of these three (Atlassian lists them at https://bitbucket.org/site/ssh; the values were current in November 2026):
> - ED25519 `SHA256:ybgmFkzwOSotHTHLJgHO0QN8L0xErw6vd0VhFA9m3SM`
> - ECDSA `SHA256:FC73VB6C4OQLSCrjEayhMp9UMxS97caD/Yyi2bhW/J0`
> - RSA `SHA256:46OSHA1Rmj8E8ERTC6xkNcmGOw9oFxYr0WF6zWW8l1E`
>
> If it matches, answer `yes`, then run this command again. If it doesn't match, answer `no` and tell your team lead.

When it is missing, gate:

> Create the private repository <ws>/<slug> on Bitbucket? (y/n)

Under `--dry-run`, skip the gate: print `--dry-run: <ws>/<slug> doesn't exist; a real run asks to create it.`

On `n`, stop with: `Nothing created. Create <ws>/<slug> on Bitbucket, private, then run again.`

On `y`, create it, and do nothing else until it exists:
1. Look for a create-repository operation on `plugin:atlassian:atlassian`. No Bitbucket operation is a primary tool: reach it through `discover` (for example `discover({query: "create Bitbucket repository"})`). If it offers one, run it with `executeWrite({name: "<the name discover returned>", inputs})` with no `cloudId` (Bitbucket operations don't take one). The inputs are the workspace, the slug and private, under the parameter names `discover` shows. If the operation can't make the repo private, don't call it.
2. If `discover` offers none, the connector is absent, or the call fails, ask: `> Create <ws>/<slug> on Bitbucket yourself, private, and say "done".`
3. Never use an API token.

Then run `git ls-remote` again. If the repo is still missing, say so and ask again, or stop on `n`.

## Step 5 — The framework

Make a temporary folder: `temp=$(mktemp -d)` (on Windows, `cygpath -m` it). Clone the framework into it fresh, never from a local working tree:

```bash
git clone --depth 1 --branch '<ref>' git@ssh.bitbucket.org:pellsoftware/pell_web_app_framework.git '<temp>/framework'
```

On failure, stop early with `Couldn't clone the framework's <ref>: <git's message>.` If git's message says `Host key verification failed` (this is the first connection to Bitbucket only when Step 4 was skipped), stop early with Step 4's host-key message instead, and never accept a host key or edit `known_hosts`. Otherwise record `<short sha>` from `git -C '<temp>/framework' rev-parse --short HEAD`. Below, `<fw>` is `<temp>/framework`.

## Step 6 — The plan

Run the fork tool for the names, always passing `--from`:

```bash
dotnet run --project '<fw>/tools/PellFramework.Fork' -c Release -- --from '<fw>' --names-only --repo '<ws>/<slug>' [--display '<display>'] [--code '<Code>'] [--lower '<lower>'] [--env '<ENV>']
```

It prints `{ "display", "code", "lower", "env", "problems": [] }` and exits 0 even when `problems` isn't empty. A non-zero exit is a usage failure: stop early with its `fork:` message.

If `problems` isn't empty, show each one and ask for overrides:

> The fork tool can't use these names. Name the forms to change (display "<name>", code <Code>, lower <lower>, env <ENV>), or n to stop.

Run `--names-only` again with the overrides until `problems` is empty. Under `--dry-run`, print the problems with the plan instead.

Unless Step 1 found a logo that passed its check, ask (under `--dry-run`, don't):

> A logo for the client? Give the path to an .svg, .png or .webp file, or say none.

Check the answer as Step 1 checks `logo`, and make it absolute; otherwise ask again.

Just before the gate, print the database the run will use. This line is not part of the gate:
- `PELLFW_TEST_SQL` set: `Database: the server in PELLFW_TEST_SQL: databases <Code> and <Code>_Test_Fork, and the connection string copied to the fork's user secrets.`
- Not set: `Database: LocalDB, database <Code>.`

Then gate once:

```
> Fork the framework (<ref> at <short sha>) for this client?
>   Names: display "<display>", code <Code>, lower <lower>, env <ENV>
>   Folder: <repos folder>/<slug>
>   Logo: <path> | none (Pell's mark stays as a placeholder)
>   Then: run it locally, run the checks, commit on main, create staging, and push both to <ws>/<slug>.
> (y/n, or name the forms to change)
```

- `y` covers Steps 7 to 12, the push included: pushing to the client repo is the standing yes from the plans README, decision 10.
- `n`: stop early with `Nothing forked.`
- Changed forms or a different logo: run `--names-only` again with them and show this gate again.

Under `--dry-run`, print the database line and the plan without asking, delete `<temp>`, and stop with `--dry-run: nothing was saved, created, cloned or pushed.`

## Step 7 — Clone and fork

If `<repos folder>/<slug>` exists now, refuse: stop early with Step 3's message. Otherwise clone the client repo (an empty repo clones with a warning, which is fine):

```bash
git clone git@ssh.bitbucket.org:<ws>/<slug>.git '<repos folder>/<slug>'
```

Below, `<folder>` is `<repos folder>/<slug>`. Run the tool with all four confirmed names:

```bash
dotnet run --project '<fw>/tools/PellFramework.Fork' -c Release -- --from '<fw>' --into '<folder>' --repo '<ws>/<slug>' --display '<display>' --code '<Code>' --lower '<lower>' --env '<ENV>' [--logo '<logo>']
```

- **Exit 0**: it prints `fork: copied N, renamed N, left out N in <s> s`. Record `<s>` as the tool's elapsed time.
- **Exit 1** (failed: usage, names, or a leftover framework name) or **exit 2** (refused: the folder holds files other than `.git`, `README.md` and `.gitignore`): stop early with the tool's `fork:` message from stderr. The tool writes nothing when it fails or refuses.

Once the fork is written, start `npm ci` as the background job `npm-ci`, so it overlaps Step 8:

```bash
cd '<folder>/<Code>.React' && { npm ci; } > '<temp>/npm-ci.log' 2>&1; echo $? > '<temp>/npm-ci.exit'
```

## Step 8 — The database

Write this snippet to `<temp>/fork-db.sh` with the Write tool, exactly as shown. It reads `PELLFW_TEST_SQL` itself, so no connection string is ever echoed, logged, put on a command line or shown in chat. Every later call that uses it begins with `source '<temp>/fork-db.sh' &&`.

```bash
# fork_conn <database>: PELLFW_TEST_SQL with its database set to <database>, on stdout, for a pipe.
fork_conn() {
  if printf '%s' "$PELLFW_TEST_SQL" | grep -qiE '(^|;)[[:space:]]*(database|initial[[:space:]]+catalog)[[:space:]]*='; then
    printf '%s' "$PELLFW_TEST_SQL" | sed -E 's/(^|;)[[:space:]]*([Dd][Aa][Tt][Aa][Bb][Aa][Ss][Ee]|[Ii][Nn][Ii][Tt][Ii][Aa][Ll][[:space:]]+[Cc][Aa][Tt][Aa][Ll][Oo][Gg])[[:space:]]*=[^;]*/\1Database='"$1"'/g'
  else
    printf '%s;Database=%s' "${PELLFW_TEST_SQL%;}" "$1"
  fi
}

# set_fork_secret <Code>: writes ConnectionStrings:Default (database <Code>) to <Code>.API's user secrets, through stdin.
set_fork_secret() {
  { printf '{"ConnectionStrings":{"Default":"'
    fork_conn "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
    printf '"}}'
  } | dotnet user-secrets set --project "$1.API" > /dev/null
}

# with_fork_db <ENV> <Code> <command...>: runs the command with <ENV>_TEST_SQL (database <Code>_Test_Fork)
# and <ENV>_TEST_ALLOW_REMOTE=1 set for that command alone. Without PELLFW_TEST_SQL it runs the command as is.
with_fork_db() {
  local env=$1 code=$2
  shift 2
  if [ -z "${PELLFW_TEST_SQL:-}" ]; then "$@"; return; fi
  ( export "${env}_TEST_SQL=$(fork_conn "${code}_Test_Fork")" "${env}_TEST_ALLOW_REMOTE=1" && "$@" )
}
```

- **`PELLFW_TEST_SQL` is set**: from `<folder>`, run `source '<temp>/fork-db.sh' && set_fork_secret '<Code>' 2> /dev/null`. The fork has its own `UserSecretsId`, so this writes only the fork's secrets. If it exits non-zero, stop early with `Couldn't write the fork's user secrets (dotnet user-secrets exited <code>). Run dotnet user-secrets list --project <Code>.API in <folder> to see why.` Never show its output: it may quote what it read. On success, print `The app uses your SQL Server from PELLFW_TEST_SQL, database <Code>, through the fork's user secrets.`
- **Not set** (Windows only; Step 2 stops elsewhere): print `The app uses LocalDB, database <Code>.`

**The LocalDB-failure path** (when Step 9 shows LocalDB failing): stop early, and as its message print this, with every `<...>` filled in except `<server>`, `<user>`, `<password>` and `<connection string>`. Never ask for any of those in chat.

```
LocalDB couldn't start the app. <folder> holds the fork; nothing is committed or pushed.

Recommended: run the command again against another SQL Server. In your own terminal:
  1. Set PELLFW_TEST_SQL (a connection string whose database is PellFramework_Test, as the framework's README says) and PELLFW_TEST_ALLOW_REMOTE=1 for your user:
     PowerShell:  [Environment]::SetEnvironmentVariable('PELLFW_TEST_SQL', '<connection string>', 'User')
                  [Environment]::SetEnvironmentVariable('PELLFW_TEST_ALLOW_REMOTE', '1', 'User')
     macOS, Linux: add export PELLFW_TEST_SQL='<connection string>' and export PELLFW_TEST_ALLOW_REMOTE=1 to your shell profile.
  2. Delete <folder>.
  3. Start a new Claude Code session and run /pell:init-client-repo <link> again.

Or finish by hand, from <folder>, in this order. Each command must pass before the next.
  1. Point the fork at the server:
     dotnet user-secrets set ConnectionStrings:Default "Server=<server>;Database=<Code>;User Id=<user>;Password=<password>;TrustServerCertificate=True" --project <Code>.API
     Then, in the same terminal, for the checks:
     Git Bash:    export <ENV>_TEST_SQL="Server=<server>;Database=<Code>_Test_Fork;User Id=<user>;Password=<password>;TrustServerCertificate=True"
                  export <ENV>_TEST_ALLOW_REMOTE=1
     PowerShell:  $env:<ENV>_TEST_SQL = "Server=<server>;Database=<Code>_Test_Fork;User Id=<user>;Password=<password>;TrustServerCertificate=True"
                  $env:<ENV>_TEST_ALLOW_REMOTE = "1"
  2. Run it: dotnet run --project <Code>.API --launch-profile https. Check that https://localhost:5173/login shows <display>, then stop it with Ctrl+C.
  3. Stage the fork, because the unit tests read the files git lists:
     git add -A
     Then the checks:
     dotnet build <Code>.Web.sln -c Release -p:ShouldRunNpmInstall=false -p:ShouldRunBuildScript=false
     dotnet test <Code>.Tests -c Release
     dotnet test <Code>.IntegrationTests -c Release
     dotnet run --project tools/<Code>.Scaffolder -c Release -- generate --check
     Then cd <Code>.React and run: npm run lint, then npm run typecheck, then npm test
  4. From <Code>.React: npm run screens -- --active --update-all. It rewrites every baseline so they show <display>; npm run screens alone keeps the old images.
  5. From <folder>, the leftover check, which must print nothing:
     git grep --untracked -n -i -E "pell.?framework|pellfw|pell_web_app_framework|pf_auth"
  6. From <folder>, add this line to the end of docs/project/run-log.md (with a blank line before it if the file holds no entry yet):
     - <YYYY-MM-DD>: forked from <ref> at <short sha>; the fork tool took <s> s; finished by hand after LocalDB failed.
  7. From <folder>, commit and push:
     git switch -c main
     git add -A
     git commit -m "Start <display> from the Pell Web App Framework (<short sha>)"
     git branch staging
     git push --atomic -u origin main staging
```

Leave out the `git switch -c main` line when the clone already has commits on `main` (Step 11, item 2).

## Step 9 — Running

Step 9 starts only after the background job `npm-ci` has exited, waited for as "Background jobs" describes: the API's Debug build runs `npm install` itself when `node_modules` is missing, and the app starts the Vite dev server. If the job failed, stop early with `npm ci failed in <Code>.React.` and the last 30 lines of its log.

1. From `<folder>`, start the app with `run_in_background`: `dotnet run --project '<Code>.API' --launch-profile https > '<temp>/app.log' 2>&1`. Its Development profile starts the Vite dev server through the SPA proxy (`npm run dev`, https://localhost:5173).
2. Wait with one bounded call, with a Bash timeout of 300000 ms: `curl -fsk --retry 90 --retry-delay 2 --retry-all-errors https://localhost:7143/api/health/ready`. If it gives up while `<temp>/app.log` shows the app still restoring or building, with no error, run the same call once more. Otherwise read `<temp>/app.log`:
   - A LocalDB error (`LocalDB`, `Local Database Runtime error`) without `PELLFW_TEST_SQL` takes the LocalDB-failure path (Step 8).
   - Anything else: stop early with `The app didn't become ready.` and the log's last 40 lines.
3. Check the sign-in page shows the display name, with a fixed-string match, since a display may hold `&` and `'`:

   ```bash
   curl -fsk --retry 30 --retry-delay 2 --retry-all-errors -o '<temp>/login.html' https://localhost:5173/login && grep -qF -- '<display>' '<temp>/login.html'
   ```

   If it fails, stop early with `The sign-in page doesn't show <display>.` and the page's `<title>` line (or curl's error).
4. Run `date +%s` and record it as `t_running`. The clock stops here.
5. **Stop the app**, both the API and the Vite server it started. Stop the background `dotnet run` task, then end whatever still listens on 7143 or 5173:
   - Windows: for each PID the Step 2 `netstat` command finds, `taskkill //PID <pid> //T //F`.
   - macOS and Linux: `kill $(lsof -t -iTCP:7143 -iTCP:5173 -sTCP:LISTEN)`.

   Run the Step 2 port check again: both ports must be free. If one is still held, stop early, naming its process.

## Step 10 — Checks

First stage the fork without committing: `git -C '<folder>' add -A` (no commit, no branch change). The fork's unit tests read the files git lists, and an unstaged fork is a list of one file.

Run these from `<folder>`, one at a time, each through `with_fork_db`. They are the fork's CLAUDE.md "Standard commands", without end to end (it needs port 7143 again) and the commands that write; if that table spells one differently, use its spelling. Pass a command that holds `&&` as `sh -c '<command>'`, so all of it runs in that environment.

In the foreground, with the Bash tool's longest timeout (600000 ms), each with its output going to a log file under `<temp>`, as the background jobs do, in this shape:

```bash
source '<temp>/fork-db.sh' && cd '<dir>' && { with_fork_db '<ENV>' '<Code>' <command>; } > '<temp>/<check>.log' 2>&1
```

`<dir>` is `<folder>` unless the item names another folder. The call's exit status is the check's. When it is non-zero, the check failed: show `tail -n 40 '<temp>/<check>.log'` as the failure's output.
1. `build`: `dotnet build <Code>.Web.sln -c Release -p:ShouldRunNpmInstall=false -p:ShouldRunBuildScript=false`
2. `unit`: `dotnet test <Code>.Tests -c Release`
3. `react`, with `<dir>` as `<folder>/<Code>.React`: `sh -c 'npm run lint && npm run typecheck && npm test'`

As background jobs from the start, since any may outlast the tool's 600 s limit. Start each only after the one before it has exited, in this shape:

```bash
source '<temp>/fork-db.sh' && cd '<dir>' && { with_fork_db '<ENV>' '<Code>' dotnet test <Code>.IntegrationTests -c Release; } > '<temp>/integration.log' 2>&1; echo $? > '<temp>/integration.exit'
```

Here too `<dir>` is `<folder>` unless the item names another folder.

4. `integration`: the integration tests, as above.
5. `generate-check`: `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate --check`
6. `screens`, on Windows only, with `<dir>` as `<folder>/<Code>.React`: `npm run screens -- --active --update-all`. It rewrites every baseline of the active theme so they show the client's name; `npm run screens` alone would keep the old images, since the name change is under the comparison's tolerance.

   The harness serves each theme's app preview and Storybook on fixed ports with `reuseExistingServer: false`, so any other screens run on the machine (the framework's, or another fork's) makes Playwright fail with `... is already used`. Before the job, find which ports an `--active` run will start:
   - `--active` runs only the theme `VITE_THEME` names in `<Code>.React/.env`. List the folders under `<Code>.React/src/themes` sorted in plain code-unit order (as `Array.prototype.sort()` does, which is what `screens/themes.ts` relies on) and take the active theme's zero-based index `i`. The app preview is on port `4301 + i`.
   - A Storybook starts on `4401 + i` as well: the harness always includes the active theme in `<Code>.React/screens/storybookThemes.js`. Read that file and `<Code>.React/screens/themes.ts` to confirm; if the harness has changed, check exactly the ports its `playwright.screens.config.ts` `webServer` entries would use for that run.

   Check those ports with the Step 2 listener commands (Windows: the same `netstat` with the screens ports in the pattern, then `tasklist`; elsewhere `lsof`). If none is held, run the job. If one is held, name the process and its PID, say `Port <port> is held by <process> (PID <pid>), another screens run, most likely. Waiting up to about 9.5 minutes for it to finish.`, and wait with one loop capped by elapsed time, inside the Bash tool's 600000 ms limit, whatever each check costs: `end=$((SECONDS+570)); while [ $SECONDS -lt $end ] && <ports held>; do sleep 5; done`, where `<ports held>` is the listener command for those ports, succeeding when it finds a listener (on Windows, pipe the `netstat` awk output into `grep -q .`, keeping the `$` anchor on the port as Step 2's pattern does, so `:4301` can't match `:43010`). The loop prints nothing. After the loop, run the listener check once more as the only thing that prints: it prints `screens ports free` and exits 0, or prints `screens ports still held: <port> by <process> (PID <pid>)` and exits non-zero. Decide from that final check's exit status and line, not from how the loop ended: 0 (free) means run the job; non-zero (still held) means stop early, naming that process. Never end that process yourself.

   If the job fails and its log holds `is already used` (scan `<temp>/screens.log`), check the ports and wait for them as above, then run the job once more in the same background shape, with the same log and exit-code files (`<temp>/screens.log`, `<temp>/screens.exit`). A second failure, or any other failure, is a failed check.

On macOS or Linux, skip `screens` (the baselines exist only for Windows) and append this line to `<folder>/docs/project/status.md`:

```
- Screenshot baselines not recaptured: they exist only for Windows. On Windows, run npm run screens -- --active --update-all in <Code>.React and commit the images.
```

Then run the leftover check again, over the working tree with untracked files counted:

```bash
git -C '<folder>' grep --untracked -n -i -E "pell.?framework|pellfw|pell_web_app_framework|pf_auth"
```

Exit 1 means no leftovers. Exit 0 means it found some: show them and stop early. Any other exit is an error: show it and stop early.

A failure stops the run before the commit: stop early with `Stopped before the commit: <command> failed. Nothing was committed or pushed.` and the last 40 lines of its log (`<temp>/<check>.log`; for the leftover check, its own output).

## Step 11 — Commit and push

1. Run `date +%s`. Append one line to `<folder>/docs/project/run-log.md`, minutes to one decimal place: `- <YYYY-MM-DD>: forked from <ref> at <short sha>; running in <t_running - t_start> min, <now - t_start> min to the commit; the fork tool took <s> s.` If the file's last line is not blank and the file holds no entry yet (its last line is the intro paragraph), write a blank line first, so the entry doesn't sit against the paragraph.
2. From `<folder>`: if the clone has no branch yet (`git rev-parse --verify -q HEAD` fails), run `git switch -c main`. If Bitbucket made an initial commit on a branch other than `main`, also run `git switch -c main`, so the fork commit goes on top of it.
3. From `<folder>`: `git add -A` again, which adds the run-log line and anything the checks wrote, then `git commit -m 'Start <display> from the Pell Web App Framework (<short sha>)'`. If the commit fails (no `user.name` or `user.email`, a hook), stop early with git's message and `Nothing was pushed. Fix the cause, then run: git -C '<folder>' commit -m "Start <display> from the Pell Web App Framework (<short sha>)", git -C '<folder>' branch staging, git -C '<folder>' push --atomic -u origin main staging`.
4. From `<folder>`: `git branch staging`, then `git push --atomic -u origin main staging`, so neither branch lands without the other. Never force.

If the push fails, print git's per-branch result (each `! [rejected]` or `! [remote rejected]` line, or its message when the server refuses an atomic push), delete `<temp>`, and stop with: `Committed on main and created staging, but the push failed. Fix the cause, then run: git -C '<folder>' push --atomic -u origin main staging`

## Step 12 — Report

Run `date +%s` as `t_end`. Print, in plain text, minutes to one decimal place:

```
Started <display> from the Pell Web App Framework (<ref> at <short sha>).

To running   <t_running - t_start> min
Waiting      <waited> min of that on you
Total        <t_end - t_start> min to pushed
Fork tool    <s> s
Repo         https://bitbucket.org/<ws>/<slug>
Folder       <folder>
Pushed       main, staging

Next:
- Send the client the logo question in docs/project/open-questions.md.
- Run /pell:map-repo in <folder>.
- Start intake with docs/project/intake-sheet.md.
```

Omit the logo line when the fork has a logo. Add a transparency line for each skipped step, such as `- Repos folder not saved (you answered no)` or `- Screenshot baselines not recaptured: not Windows (see docs/project/status.md)`.

Then delete the temporary framework clone: `rm -rf '<temp>'`. If that fails, print `Couldn't delete <temp>; delete it yourself.`

## Operator notes

- **Never** push anywhere but `origin` in the client's clone, and never force. The framework clone is never pushed.
- **Never** create a repo without the create gate's `y` in this run, never a public one, and never with an API token.
- **Never** echo, log or show a connection string, or put one on a command line. Only the Step 8 snippet reads `PELLFW_TEST_SQL`. Never read another project's user secrets.
- **Never** accept an SSH host key for the engineer and never edit `~/.ssh/known_hosts`. On `Host key verification failed`, stop and give the engineer the `host_key_info` steps (Step 4).
- **Never** fork from a local working tree. The source is always the fresh clone from Step 5, passed as `--from`.
- **Never** put a workspace, slug, ref or path into a shell command before it passes its Step 1 check.
- **Always** stop early as Step 1 describes: the app stopped, background jobs finished, `<temp>` deleted, and the fork folder left for the engineer.
- The plan gate's `y` covers Steps 7 to 12, the push included. The other side effects have their own gates: saving the repos folder (Step 3) and creating the repo (Step 4). `--reset` is the engineer's own request to clear the saved folder.
- The app, the integration tests and `generate --check` share the database and port 7143: run one at a time.
- The fork's first Vite start exports the ASP.NET dev certificate for `<lower>.react.client` to `%APPDATA%/ASP.NET/https` (`~/.aspnet/https` elsewhere), as every app made from the template does.

## Failure behavior

| Condition | Behavior |
|-|-|
| No link in `$ARGUMENTS`, or a workspace, slug or ref that fails its check | Ask for it again (Step 1) |
| `git`, `dotnet`, `npm` or `curl` missing | Name it and stop (Step 2) |
| macOS or Linux without `PELLFW_TEST_SQL` | Stop before the plan: there is no LocalDB (Step 2) |
| Port 7143 or 5173 in use | Name the process and its PID, and stop (Step 2). After the app stops, a port still held is named the same way (Step 9) |
| A port the screens job will serve (4301 + i, 4401 + i) is held, or the job fails with `is already used` | Name the process and wait up to 10 minutes for the port to free, then run the job (once more after an `is already used` failure). Still held after the wait: stop early naming the process (Step 10) |
| `<repos folder>/<slug>` exists | Stop before the plan (Step 3), and again before cloning (Step 7) |
| git can't reach the repo (SSH key, network) | Show git's message and stop (Step 4) |
| `Host key verification failed` from `ls-remote` or the framework clone | Stop (early, for the clone) with the `ssh git@ssh.bitbucket.org host_key_info` steps and the three fingerprints. Never accept a key or edit `known_hosts` (Steps 4 and 5) |
| Atlassian connector absent, no create-repository operation in `discover`, or the call fails | Degrade, never abort: ask the engineer to create the repo, private, and say "done" (Step 4) |
| The framework ref doesn't exist | Show git's message and stop early (Step 5) |
| The names have problems | Show them and ask for overrides (Step 6) |
| The tool fails (exit 1) or refuses (exit 2) | Stop early with its `fork:` message. The tool wrote nothing; delete the clone before running again (Step 7) |
| `set_fork_secret` fails | Stop early with its exit code, never its output (Step 8) |
| `npm ci` fails | Stop early with the end of its log, before the app starts (Step 9) |
| LocalDB fails | Stop early: recommend a rerun with `PELLFW_TEST_SQL`, or list every remaining step to finish by hand (Step 8) |
| The app isn't ready, or the sign-in page lacks the display name | Stop early with the app's log or the page's title (Step 9) |
| A check fails, or the leftover check finds a match | Stop early before the commit, with the command and the end of its output. The folder stays (Step 10) |
| `git commit` fails | Stop early with git's message and the commands to commit and push by hand. Nothing is pushed (Step 11) |
| The push fails | The commit and `staging` stay local. Print git's per-branch result and the push command to retry. Never force (Step 11) |
| `<temp>` can't be deleted | Print its path (Step 12) |

MCP handling is notify, never force. Without the Atlassian connector the command still runs; creating the repo becomes the engineer's step.
