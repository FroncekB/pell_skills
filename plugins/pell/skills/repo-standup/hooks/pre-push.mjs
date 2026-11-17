// Git pre-push hook, the second layer behind guard.mjs. Git hands it the URL it
// really pushes to and each ref, so it also catches pushes from scripts and
// aliases that the command-text layer cannot see. It reads the client repo from
// .claude/repo-standup/client-repo, which setup pins. Node standard library only.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FRAMEWORK_REPO, PREFIX, readClientRepo, repoFromUrl, runsDirectly } from './guard.mjs';

const ZERO = /^0+$/;
const refuse = (why) => ({ allow: false, reason: PREFIX + why });

// `lines` are git's stdin lines: <local ref> <local sha> <remote ref> <remote sha>.
// isAncestor(remoteSha, localSha) returns true, false, or null when it cannot tell.
export function decidePush(url, lines, { clientRepo, isAncestor }) {
  const name = repoFromUrl(url ?? '');
  if (name === FRAMEWORK_REPO) return refuse('the push URL is the framework repo');
  if (!clientRepo || name !== clientRepo.toLowerCase()) {
    return refuse(`the push URL is not the client repo (${clientRepo ?? 'none pinned in .claude/repo-standup/client-repo'})`);
  }
  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) return refuse(`unreadable push line "${line}"`);
    const [, localSha, remoteRef, remoteSha] = fields;
    if (remoteRef !== 'refs/heads/main') return refuse(`${remoteRef} is not refs/heads/main`);
    if (ZERO.test(localSha)) return refuse('deleting a ref is not allowed');
    if (ZERO.test(remoteSha)) continue;
    const ancestor = isAncestor(remoteSha, localSha);
    if (ancestor === null) return refuse('cannot check that the push is a fast-forward: the remote commit is not present locally');
    if (!ancestor) return refuse('the push is not a fast-forward');
  }
  return { allow: true };
}

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function main() {
  const url = (process.argv[3] ?? '').trim();
  let result;
  try {
    const top = git(['rev-parse', '--show-toplevel']).stdout.trim();
    const lines = readFileSync(0, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    result = decidePush(url, lines, {
      clientRepo: top ? readClientRepo(top) : null,
      isAncestor: (remoteSha, localSha) => {
        const r = git(['merge-base', '--is-ancestor', remoteSha, localSha]);
        return r.status === 0 ? true : r.status === 1 ? false : null;
      },
    });
  } catch (error) {
    result = refuse(`internal error while judging a push (${error.message})`);
  }
  if (!result.allow) {
    process.stderr.write(`${result.reason}\n`);
    process.exit(1);
  }
}

if (runsDirectly(import.meta.url)) main();
