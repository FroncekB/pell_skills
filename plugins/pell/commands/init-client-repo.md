---
description: "Start a client project from the Pell Web App Framework: clone the client's Bitbucket repo, fork the framework into it under the client's name, run it locally, check it, and push main and staging. Read-only until you confirm the plan."
argument-hint: "<bitbucket repo link> [name \"<display name>\"] [logo <path>] [ref <framework branch>] [--dry-run] [--reset]"
---

You are running **`/pell:init-client-repo`**. It turns a client's Bitbucket repo link into that repo holding the Pell Web App Framework under the client's name: forked by the framework's own tool from a fresh clone, running locally with the client's name on the sign-in page, checked, committed on `main`, branched to `staging`, and pushed. It is read-only until the engineer confirms the plan in Step 6. Before that, the only writes are the two it asks for by name: saving the repos folder (Step 3) and creating the repo (Step 4).

The user passed: `$ARGUMENTS`

## Step 1 — Parse arguments

Work through `$ARGUMENTS` in this order, stripping each recognized token as you go.

1. **Modifiers** (case-insensitive): `--dry-run`, `--reset`.
   - `--dry-run` → `dry_run = true`. A dry run has no side effect beyond a temporary framework clone it deletes: it never saves the config, creates the repo or clones the client repo. It runs `--names-only`, prints the plan, and stops. A check that would stop a real run before the plan (a busy port, an existing folder, a missing repo) prints its line, and the dry run goes on to the plan.
   - `--reset` → `reset = true` (Step 3). If both appear, `--dry-run` wins: print `Both "--dry-run" and "--reset" were given — --dry-run wins; the saved repos folder is left alone.`
2. **The link**: `https://bitbucket.org/<ws>/<slug>` (also with a `user@` before the host, a trailing `/` or `.git`, or more path such as `/src/main/`) or `git@bitbucket.org:<ws>/<slug>.git`. Take the workspace and slug from the first two path segments, without `.git`. With no link, ask: `> Which Bitbucket repository is this client's? Paste its link.` When `--reset` is the only argument, do Step 3's reset and stop instead.
3. **`name "<display>"`** → `display`, the client's name as users read it.
4. **`logo <path>`** → `logo`.
5. **`ref <branch>`**, or a phrase naming a framework branch (`from the framework's <branch> branch`) → `ref`. Default `react`.
6. The rest is context. A name form given in words (`code AcmeOps`, `lower acmeops`, `env ACMEOPS`) is an override passed to the tool in Step 6.

Run `date +%s` and record it as `t_start`. Set `waited = 0`. From here on, for every question to the engineer, run `date +%s` just before asking and again first thing after the answer, and add the difference to `waited`.

Shell conventions for every step:
- Run shell steps with the Bash tool (Git Bash on Windows). Each call starts a fresh shell, so carry the folders, names and times yourself. Windows means `uname -s` starts with `MINGW`, `MSYS` or `CYGWIN`.
- Quote a value for the shell in single quotes, each `'` written as `'\''`. A display such as `Acme & Field Ops` or `Pat's Field Ops` holds characters the shell would otherwise read.
- On Windows, write paths as `C:/Users/...` (`cygpath -m` converts a Git Bash path), which Git Bash and `dotnet` both read.

## Step 2 — Prerequisites

Run `command -v git dotnet npm curl`. If one is missing, stop with: `<tool> isn't on the PATH. Install it as the framework's README describes, then run again.`

Ports 7143 and 5173 must be free: the fork runs on the framework's ports. Find any listener:
- Windows: `netstat -ano | awk '$4 == "LISTENING" && $2 ~ /:(7143|5173)$/ {print $2, $NF}'`, then name each PID with `tasklist //FI "PID eq <pid>" //FO CSV //NH`.
- macOS and Linux: `lsof -nP -iTCP:7143 -iTCP:5173 -sTCP:LISTEN`.

If either port is held, stop with: `Port <port> is in use by <process> (PID <pid>). Stop that app, then run again.`

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

Run `git ls-remote git@bitbucket.org:<ws>/<slug>.git`.
- **Exit 0**: the repo exists. Print `<ws>/<slug> exists on Bitbucket.`
- **Git says the repository doesn't exist** (`repository does not exist`, `Repository not found`): the repo is missing, or you can't see it.
- **Any other failure**, such as `Permission denied (publickey)` or a network error: stop with `git can't reach <ws>/<slug> on Bitbucket: <git's message>. Check your SSH key with ssh -T git@bitbucket.org, then run again.`

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
git clone --depth 1 --branch <ref> git@bitbucket.org:pellsoftware/pell_web_app_framework.git '<temp>/framework'
```

On failure, delete `<temp>` and stop with `Couldn't clone the framework's <ref>: <git's message>.` Otherwise record `<short sha>` from `git -C '<temp>/framework' rev-parse --short HEAD`. Below, `<fw>` is `<temp>/framework`.

## Step 6 — The plan

Run the fork tool for the names, always passing `--from`:

```bash
dotnet run --project '<fw>/tools/PellFramework.Fork' -c Release -- --from '<fw>' --names-only --repo <ws>/<slug> [--display '<display>'] [--code <Code>] [--lower <lower>] [--env <ENV>]
```

It prints `{ "display", "code", "lower", "env", "problems": [] }` and exits 0 even when `problems` isn't empty. A non-zero exit is a usage failure: print its `fork:` message, delete `<temp>`, and stop.

If `problems` isn't empty, show each one and ask for overrides:

> The fork tool can't use these names. Name the forms to change (display "<name>", code <Code>, lower <lower>, env <ENV>), or n to stop.

Run `--names-only` again with the overrides until `problems` is empty. Under `--dry-run`, print the problems with the plan instead.

Unless Step 1 found `logo`, ask (under `--dry-run`, don't):

> A logo for the client? Give the path to an .svg, .png or .webp file, or say none.

Check that the file exists and has one of those extensions; otherwise ask again. Then gate once:

```
> Fork the framework (<ref> at <short sha>) for this client?
>   Names: display "<display>", code <Code>, lower <lower>, env <ENV>
>   Folder: <repos folder>/<slug>
>   Logo: <path> | none (Pell's mark stays as a placeholder)
>   Then: run it locally, run the checks, commit on main, create staging, and push both to <ws>/<slug>.
> (y/n, or name the forms to change)
```

- `y` covers Steps 7 to 12, the push included: pushing to the client repo is the standing yes from the plans README, decision 10.
- `n`: delete `<temp>` and stop with `Nothing forked.` If Step 4 created the repo in this run, add `<ws>/<slug> was created and is still empty.`
- Changed forms or a different logo: run `--names-only` again with them and show this gate again.

Under `--dry-run`, print the plan without asking, delete `<temp>`, and stop with `--dry-run: nothing was saved, created, cloned or pushed.`

## Step 7 — Clone and fork

If `<repos folder>/<slug>` exists now, refuse: delete `<temp>` and stop as in Step 3. Otherwise clone the client repo (an empty repo clones with a warning, which is fine):

```bash
git clone git@bitbucket.org:<ws>/<slug>.git '<repos folder>/<slug>'
```

Below, `<folder>` is `<repos folder>/<slug>`. Run the tool with all four confirmed names:

```bash
dotnet run --project '<fw>/tools/PellFramework.Fork' -c Release -- --from '<fw>' --into '<folder>' --repo <ws>/<slug> --display '<display>' --code <Code> --lower <lower> --env <ENV> [--logo '<logo>']
```

- **Exit 0**: it prints `fork: copied N, renamed N, left out N in <s> s`. Record `<s>` as the tool's elapsed time.
- **Exit 1** (failed: usage, names, or a leftover framework name) or **exit 2** (refused: the folder holds files other than `.git`, `README.md` and `.gitignore`): print the tool's `fork:` message from stderr, delete `<temp>`, and stop. The tool writes nothing when it fails or refuses.

Once the fork is written, start `npm ci` with the Bash tool's `run_in_background` option, so it overlaps Step 8:

```bash
cd '<folder>/<Code>.React' && { npm ci > '<temp>/npm-ci.log' 2>&1; echo $? > '<temp>/npm-ci.exit'; }
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

- **`PELLFW_TEST_SQL` is set** (test it with `[ -n "${PELLFW_TEST_SQL:-}" ]`, never by printing it): from `<folder>`, run `source '<temp>/fork-db.sh' && set_fork_secret <Code>`. The fork has its own `UserSecretsId`, so this writes only the fork's secrets. Print `The app uses your SQL Server from PELLFW_TEST_SQL, database <Code>, through the fork's user secrets.`
- **Not set, on Windows**: print `The app uses LocalDB, database <Code>.`
- **Not set, on macOS or Linux**: there is no LocalDB. Take the LocalDB-failure path now.

**The LocalDB-failure path** (here, or when Step 9 shows LocalDB failing): stop the app if it is running (Step 9), delete `<temp>`, and print these for the engineer to run in their own terminal. Never ask for a server, user or password in chat.

```
cd '<folder>'
dotnet user-secrets set ConnectionStrings:Default "Server=<server>;Database=<Code>;User Id=<user>;Password=<password>;TrustServerCertificate=True" --project <Code>.API
export <ENV>_TEST_SQL="Server=<server>;Database=<Code>_Test_Fork;User Id=<user>;Password=<password>;TrustServerCertificate=True"
export <ENV>_TEST_ALLOW_REMOTE=1
```

Then: `With those set, run the commands in the fork's CLAUDE.md "Standard commands", then: git switch -c main (if the clone has no branch yet), git add -A, git commit -m "Start <display> from the Pell Web App Framework (<short sha>)", git branch staging, git push -u origin main staging. Or set PELLFW_TEST_SQL to a connection string for that server, delete <folder>, and run /pell:init-client-repo again in a new session.` Stop the run: nothing is committed or pushed.

## Step 9 — Running

Step 9 starts only after the background `npm ci` has exited (the Bash tool reports when a background command finishes): the API's Debug build runs `npm install` itself when `node_modules` is missing, and the app starts the Vite dev server. Read `<temp>/npm-ci.exit`. If it isn't `0`, show the last 30 lines of `<temp>/npm-ci.log` and stop as a failed check (Step 10).

1. From `<folder>`, start the app with `run_in_background`: `dotnet run --project <Code>.API --launch-profile https`. Its Development profile starts the Vite dev server through the SPA proxy (`npm run dev`, https://localhost:5173).
2. Wait with one bounded call, with a Bash timeout of 300000 ms: `curl -fsk --retry 90 --retry-delay 2 --retry-all-errors https://localhost:7143/api/health/ready`. If it gives up while the app's output shows it still restoring or building, with no error, run the same call once more. Otherwise read the app's output. A LocalDB error (`LocalDB`, `Local Database Runtime error`) without `PELLFW_TEST_SQL` takes the LocalDB-failure path (Step 8). Anything else: show its last 40 lines, stop the app, delete `<temp>`, and stop.
3. Check the sign-in page shows the display name, with a fixed-string match, since a display may hold `&` and `'`:

   ```bash
   curl -fsk --retry 30 --retry-delay 2 --retry-all-errors -o '<temp>/login.html' https://localhost:5173/login && grep -qF -- '<display>' '<temp>/login.html'
   ```

   If it fails, show the page's `<title>` line (or curl's error), stop the app, delete `<temp>`, and stop.
4. Run `date +%s` and record it as `t_running`. The clock stops here.
5. **Stop the app**, both the API and the Vite server it started. Stop the background `dotnet run` task, then end whatever still listens on 7143 or 5173:
   - Windows: for each PID the Step 2 `netstat` command finds, `taskkill //PID <pid> //T //F`.
   - macOS and Linux: `kill $(lsof -t -iTCP:7143 -iTCP:5173 -sTCP:LISTEN)`.

   Run the Step 2 port check again: both ports must be free. If one is still held, name its process and stop.

## Step 10 — Checks

Run these from `<folder>`, one at a time, each as `source '<temp>/fork-db.sh' && with_fork_db <ENV> <Code> <command>`. They are the fork's CLAUDE.md "Standard commands", without end to end (it needs port 7143 again) and the commands that write; if that table spells one differently, use its spelling. Pass a command that holds `&&` as `sh -c '<command>'`, so all of it runs in that environment. Give each call the Bash tool's longest timeout (600000 ms); run one that outlasts it with `run_in_background` and start the next only after it exits.

1. The build: `dotnet build <Code>.Web.sln -c Release -p:ShouldRunNpmInstall=false -p:ShouldRunBuildScript=false`
2. The unit tests: `dotnet test <Code>.Tests -c Release`
3. The integration tests: `dotnet test <Code>.IntegrationTests -c Release`
4. In `<Code>.React`: `sh -c 'npm run lint && npm run typecheck && npm test'`
5. `dotnet run --project tools/<Code>.Scaffolder -c Release -- generate --check`

Then the baselines. On Windows, in `<Code>.React`, run `npm run screens -- --active --update-all`, which rewrites every baseline of the active theme so they show the client's name. On macOS or Linux, skip it (the baselines exist only for Windows) and append to `docs/project/status.md`:

```
- Screenshot baselines not recaptured: they exist only for Windows. On Windows, run npm run screens -- --active --update-all in <Code>.React and commit the images.
```

Then run the leftover check again, over the working tree with untracked files counted:

```bash
git grep --untracked -n -i -E "pell.?framework|pellfw|pell_web_app_framework|pf_auth"
```

Exit 1 means no leftovers. Exit 0 means it found some: show them and stop. Any other exit is an error: show it and stop.

A failure stops the run before the commit: print the failing command and the last 40 lines of its output, delete `<temp>`, and print `Stopped before the commit. <folder> holds the fork as it stands; nothing was committed or pushed.` The folder is left for the engineer to look at.

## Step 11 — Commit and push

From `<folder>`:
1. Run `date +%s`. Append one line to `docs/project/run-log.md`, minutes to one decimal place: `- <YYYY-MM-DD>: forked from <ref> at <short sha>; running in <t_running - t_start> min, <now - t_start> min in total; the fork tool took <s> s.`
2. If the clone has no branch yet (`git rev-parse --verify -q HEAD` fails), run `git switch -c main`. If Bitbucket made an initial commit on a branch other than `main`, also run `git switch -c main`, so the fork commit goes on top of it.
3. `git add -A`, then `git commit -m 'Start <display> from the Pell Web App Framework (<short sha>)'`.
4. `git branch staging`, then `git push -u origin main staging`. Never force.

If the push fails, print git's message and stop with: `Committed on main and created staging, but the push failed. Fix the cause, then run: git -C '<folder>' push -u origin main staging`

## Step 12 — Report

Run `date +%s` as `t_end`. Print, in plain text, minutes to one decimal place:

```
Started <display> from the Pell Web App Framework (<ref> at <short sha>).

To running   <t_running - t_start> min
Waiting      <waited> min of that on you
Total        <t_end - t_start> min
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
- **Never** fork from a local working tree. The source is always the fresh clone from Step 5, passed as `--from`.
- **Always** stop the app and delete `<temp>` on every path that ends the run early. Leave the fork folder for the engineer.
- The plan gate's `y` covers Steps 7 to 12, the push included. The other side effects have their own gates: saving the repos folder (Step 3) and creating the repo (Step 4). `--reset` is the engineer's own request to clear the saved folder.
- The app, the integration tests and `generate --check` share the database and port 7143: run one at a time.
- The fork's first Vite start exports the ASP.NET dev certificate for `<lower>.react.client` to `%APPDATA%/ASP.NET/https` (`~/.aspnet/https` elsewhere), as every app made from the template does.

## Failure behavior

| Condition | Behavior |
|-|-|
| No link in `$ARGUMENTS` | Ask for it (Step 1) |
| `git`, `dotnet`, `npm` or `curl` missing | Name it and stop (Step 2) |
| Port 7143 or 5173 in use | Name the process and its PID, and stop (Step 2). After the app stops, a port still held is named the same way (Step 9) |
| `<repos folder>/<slug>` exists | Stop before the plan (Step 3), and again before cloning (Step 7) |
| git can't reach the repo (SSH key, network) | Show git's message and stop (Step 4) |
| Atlassian connector absent, no create-repository operation in `discover`, or the call fails | Degrade, never abort: ask the engineer to create the repo, private, and say "done" (Step 4) |
| The framework ref doesn't exist | Show git's message and stop (Step 5) |
| The names have problems | Show them and ask for overrides (Step 6) |
| The tool fails (exit 1) or refuses (exit 2) | Print its `fork:` message and stop. The tool wrote nothing (Step 7) |
| `npm ci` fails | Show the end of its log and stop before the app starts (Step 9) |
| LocalDB fails, or no LocalDB on macOS or Linux | Print the user-secrets command and the `<ENV>_TEST_SQL` variables for the engineer to run, and stop (Step 8) |
| The app isn't ready, or the sign-in page lacks the display name | Show the app's output or the page's title, stop the app, and stop (Step 9) |
| A check fails, or the leftover check finds a match | Stop before the commit, with the command and the end of its output. The folder stays (Step 10) |
| The push fails | The commit and `staging` stay local. Print git's message and the push command to retry. Never force (Step 11) |
| `<temp>` can't be deleted | Print its path (Step 12) |

MCP handling is notify, never force. Without the Atlassian connector the command still runs; creating the repo becomes the engineer's step.
