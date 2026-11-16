// A small lexer for Bash and PowerShell command lines, for guard.mjs. It splits
// a command into segments of words the way the named shell does, and reports
// what it cannot classify. It runs nothing. Node standard library only.
//
// parseShell(text, shell) returns
//   segments: [{ words, piped, dynamicCall }]
//     words:       [{ raw, value }]  raw keeps quotes and escapes, value drops them
//     piped:       the segment follows a single `|`
//     dynamicCall: the segment starts with `&` followed by `$`, `(` or `{`
//   problems: strings naming input the lexer cannot classify
//
// shell is 'bash' or 'powershell'. They differ on the escape character (`\` in
// Bash, the backtick in PowerShell), on backticks (command substitution in Bash),
// on `''` and `""` inside quotes, on `$'...'` and on here-strings and smart quotes.
//
// Nested $( ), backticks (Bash), <( ) and >( ) are parsed too, and their segments
// are added to the same list, so a command hidden inside one is judged like any other.
//
// A Bash heredoc becomes one word: raw is the operator and delimiter, value the
// delimiter, and `heredoc` the body, filled in when its line ends. A body is
// literal text when the delimiter is quoted; otherwise its $( ) and backticks
// are parsed as nested commands.

export function parseShell(text, shell = 'bash') {
  const out = { segments: [], problems: [] };
  const ps = shell === 'powershell';
  let source = String(text);
  if (ps) source = source.replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  lex(source, out, ps);
  return out;
}

// The Bash heredoc operator at `at` (`<<` or `<<-` and its delimiter word):
// { delim, quoted, strip, end }, or null when `at` holds none.
function heredocOp(text, at) {
  if (text[at - 1] === '<' || text[at] !== '<' || text[at + 1] !== '<' || text[at + 2] === '<') return null;
  let i = at + 2;
  const strip = text[i] === '-';
  if (strip) i += 1;
  while (text[i] === ' ' || text[i] === '\t') i += 1;
  let delim = '';
  let quoted = false;
  while (i < text.length && !/[\s;&|<>()]/.test(text[i])) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const close = text.indexOf(c, i + 1);
      const end = close === -1 ? text.length : close;
      delim += text.slice(i + 1, end);
      quoted = true;
      i = end + 1;
    } else {
      if (c === '\\') quoted = true;
      delim += c === '\\' ? text[i + 1] ?? '' : c;
      i += c === '\\' ? 2 : 1;
    }
  }
  return { delim, quoted, strip, end: Math.min(i, text.length) };
}

// The bodies of the `pending` heredocs, read from `start` (just after a newline).
// A line ends at \n; a trailing \r is ignored when matching the delimiter.
function heredocBodies(text, start, pending) {
  let i = start;
  let closed = true;
  const bodies = pending.map((op) => {
    const lines = [];
    for (;;) {
      if (i >= text.length) {
        closed = false;
        break;
      }
      const nl = text.indexOf('\n', i);
      const line = text.slice(i, nl === -1 ? text.length : nl).replace(/\r$/, '');
      i = nl === -1 ? text.length : nl + 1;
      if ((op.strip ? line.replace(/^\t+/, '') : line) === op.delim) break;
      lines.push(line);
    }
    return lines.join('\n');
  });
  return { bodies, end: i, closed };
}

// Index of the `)` matching the `(` at `open`, skipping quotes, escapes and Bash
// heredoc bodies; -1 when unmatched.
function matchParen(text, open, ps = false) {
  let depth = 1;
  let pending = [];
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (!ps && c === '<' && heredocOp(text, i)) {
      const op = heredocOp(text, i);
      pending.push(op);
      i = op.end - 1;
    } else if (c === '\n' && pending.length > 0) {
      i = heredocBodies(text, i + 1, pending).end - 1;
      pending = [];
    } else if (c === '\\' || c === '`') i += 1;
    else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      i = end === -1 ? text.length : end;
    } else if (c === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\' || text[i] === '`') i += 1;
    } else if (c === '(') depth += 1;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

function lex(text, out, ps) {
  const n = text.length;
  let words = [];
  let cur = null;
  let piped = false;
  let dynamicCall = false;
  let i = 0;

  const word = () => (cur ??= { raw: '', value: '' });
  const add = (raw, value = raw) => {
    const w = word();
    w.raw += raw;
    w.value += value;
  };
  const endWord = () => {
    if (cur) words.push(cur);
    cur = null;
  };
  const endSegment = (nextPiped) => {
    endWord();
    if (words.length > 0 || dynamicCall) {
      out.segments.push({ words, piped, dynamicCall });
      piped = nextPiped;
    } else {
      piped = piped || nextPiped;
    }
    words = [];
    dynamicCall = false;
  };
  const separator = (length, nextPiped = false) => {
    endSegment(nextPiped);
    i += length;
  };
  // Parse the code between `open` + 1 and its matching `)`; returns the index after it.
  const nestedParen = (open) => {
    const close = matchParen(text, open, ps);
    if (close === -1) out.problems.push('unmatched parenthesis');
    lex(text.slice(open + 1, close === -1 ? n : close), out, ps);
    return close === -1 ? n : close + 1;
  };
  // Bash backticks hold a nested command; returns the index after the closing backtick.
  const nestedBacktick = (at) => {
    const close = text.indexOf('`', at + 1);
    if (close === -1) out.problems.push('unmatched backtick');
    lex(text.slice(at + 1, close === -1 ? n : close), out, ps);
    return close === -1 ? n : close + 1;
  };
  const substitution = (at, open) => {
    const end = nestedParen(open);
    add(text.slice(at, end));
    i = end;
  };

  let heredocs = [];

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    if (c === ' ' || c === '\t') { endWord(); i += 1; continue; }
    if (c === '\n' && heredocs.length > 0) {
      separator(1);
      const { bodies, end, closed } = heredocBodies(text, i, heredocs);
      if (!closed) out.problems.push('unterminated heredoc');
      heredocs.forEach((op, k) => {
        op.word.heredoc = bodies[k];
        if (!op.quoted) lexExpansions(bodies[k], out);
      });
      heredocs = [];
      i = end;
      continue;
    }
    if (c === '\n' || c === '\r' || c === ';') { separator(1); continue; }
    if (c === '|') { separator(next === '|' ? 2 : 1, next !== '|'); continue; }
    if (c === '(' || c === ')') { separator(1); continue; }
    if ((c === '{' || c === '}') && !cur) { separator(1); continue; }

    if (c === '&') {
      if (next === '&') { separator(2); continue; }
      if (cur && (text[i - 1] === '>' || text[i - 1] === '<')) { add(c); i += 1; continue; }
      if (words.length === 0 && !cur) {
        let j = i + 1;
        while (text[j] === ' ' || text[j] === '\t') j += 1;
        if (text[j] === '$' || text[j] === '(' || text[j] === '{') dynamicCall = true;
        i += 1;
        continue;
      }
      separator(1);
      continue;
    }

    if (c === '#' && !cur) {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i += 1;
      continue;
    }
    if (c === '<' && next === '#') {
      if (!ps) {
        i += 1;
        continue;
      }
      const end = text.indexOf('#>', i + 2);
      if (end === -1) out.problems.push('unterminated block comment');
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (!ps && heredocOp(text, i)) {
      const op = heredocOp(text, i);
      if (!op.delim) out.problems.push('heredoc without a delimiter');
      endWord();
      op.word = { raw: text.slice(i, op.end), value: op.delim, heredoc: '' };
      words.push(op.word);
      heredocs.push(op);
      i = op.end;
      continue;
    }
    if ((c === '<' || c === '>') && next === '(') { substitution(i, i + 1); continue; }

    if (ps && c === '@' && (next === "'" || next === '"')) {
      const head = /^[ \t]*\r?\n/.exec(text.slice(i + 2));
      if (head) {
        const bodyStart = i + 2 + head[0].length;
        const m = new RegExp(`(^|\\r?\\n)${next}@`).exec(text.slice(bodyStart));
        if (!m) out.problems.push('unterminated here-string');
        const bodyEnd = m ? bodyStart + m.index : n;
        const after = m ? bodyStart + m.index + m[0].length : n;
        const body = text.slice(bodyStart, bodyEnd);
        if (next === '"') {
          for (let at = body.indexOf('$('); at !== -1; at = body.indexOf('$(', at + 1)) {
            const close = matchParen(body, at + 1, ps);
            lex(body.slice(at + 2, close === -1 ? body.length : close), out, ps);
          }
        }
        add(text.slice(i, after), body);
        i = after;
        continue;
      }
    }

    if (c === "'") {
      add(c, '');
      i += 1;
      let closed = false;
      while (i < n) {
        if (text[i] === "'") {
          if (ps && text[i + 1] === "'") { add("''", "'"); i += 2; continue; }
          add("'", '');
          i += 1;
          closed = true;
          break;
        }
        add(text[i]);
        i += 1;
      }
      if (!closed) out.problems.push('unterminated quote');
      continue;
    }

    if (c === '"') {
      add(c, '');
      i += 1;
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === '"') {
          if (ps && text[i + 1] === '"') { add('""', '"'); i += 2; continue; }
          add(d, '');
          i += 1;
          closed = true;
          break;
        }
        if (!ps && d === '\\' && text[i + 1] !== undefined && '$"\\`\n'.includes(text[i + 1])) {
          add(d + text[i + 1], text[i + 1]);
          i += 2;
          continue;
        }
        if (ps && d === '`') {
          add(d + (text[i + 1] ?? ''), text[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (!ps && d === '`') {
          const end = nestedBacktick(i);
          add(text.slice(i, end));
          i = end;
          continue;
        }
        if (d === '$' && text[i + 1] === '(') {
          const end = nestedParen(i + 1);
          add(text.slice(i, end));
          i = end;
          continue;
        }
        add(d);
        i += 1;
      }
      if (!closed) out.problems.push('unterminated quote');
      continue;
    }

    if (!ps && c === '\\') {
      if (next === '\n') { i += 2; continue; }
      add(c + (next ?? ''), next ?? '');
      i += 2;
      continue;
    }
    if (ps && c === '`') {
      add(c + (next ?? ''), next ?? '');
      i += 2;
      continue;
    }
    if (!ps && c === '`') {
      const end = nestedBacktick(i);
      add(text.slice(i, end));
      i = end;
      continue;
    }
    if (!ps && c === '$' && next === "'") {
      out.problems.push('ANSI-C quoting');
      let j = i + 2;
      while (j < n && text[j] !== "'") j += text[j] === '\\' ? 2 : 1;
      const end = Math.min(j + 1, n);
      add(text.slice(i, end), text.slice(i + 2, j));
      i = end;
      continue;
    }
    if (c === '$' && next === '(') { substitution(i, i + 1); continue; }
    if (c === '$' && next === '{') {
      const end = text.indexOf('}', i);
      const stop = end === -1 ? n : end + 1;
      add(text.slice(i, stop));
      i = stop;
      continue;
    }

    add(c);
    i += 1;
  }
  if (heredocs.length > 0) out.problems.push('unterminated heredoc');
  endSegment(false);
}

// An unquoted heredoc body is literal except for its $( ) and backticks, which run.
function lexExpansions(body, out) {
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') i += 1;
    else if (body[i] === '$' && body[i + 1] === '(') {
      const close = matchParen(body, i + 1);
      if (close === -1) out.problems.push('unmatched parenthesis');
      lex(body.slice(i + 2, close === -1 ? body.length : close), out, false);
      i = close === -1 ? body.length : close;
    } else if (body[i] === '`') {
      const close = body.indexOf('`', i + 1);
      if (close === -1) out.problems.push('unmatched backtick');
      lex(body.slice(i + 1, close === -1 ? body.length : close), out, false);
      i = close === -1 ? body.length : close;
    }
  }
}

// A command word's program name: no folder, lowercase, no .exe.
export const commandName = (value) => value.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');

const SHELLS = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash']);
const POWERSHELLS = new Set(['pwsh', 'powershell']);
// PowerShell parameters whose value is the next word, by name or alias.
const PS_VALUE_PARAMS = ['executionpolicy', 'windowstyle', 'inputformat', 'outputformat', 'configurationname',
  'workingdirectory', 'version', 'psconsolefile', 'settingsfile', 'custompipename', 'configurationfile'];
const PS_VALUE_ALIASES = new Set(['ex', 'ep', 'w', 'wd', 'v', 'if', 'of', 'config']);
const psTakesValue = (flag) => PS_VALUE_ALIASES.has(flag) || (flag.length >= 3 && PS_VALUE_PARAMS.some((p) => p.startsWith(flag)));

// For a shell, PowerShell or cmd running a code string: { tool, code, outer },
// where outer is the wrapper's own words; { deny: why } when the form cannot be
// judged; null when the program runs no code string.
export function nestedCode(name, words, tool) {
  const rest = words.slice(1);
  const found = (codeTool, at, code) => ({ tool: codeTool, code, outer: [words[0], ...rest.slice(0, at)] });
  if (SHELLS.has(name)) {
    // The code is the first non-option word after the option cluster holding c.
    const cluster = rest.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w.raw));
    if (cluster === -1) return null;
    let at = cluster + 1;
    while (at < rest.length && /^[-+]/.test(rest[at].raw)) {
      at += 1;
      if (rest[at - 1].raw === '--') break;
    }
    if (at >= rest.length) return { deny: 'the code string after -c cannot be found' };
    if (at < rest.length - 1) return { deny: 'words after a -c code string become its positional parameters' };
    return found('Bash', at, rest[at].value);
  }
  if (POWERSHELLS.has(name)) {
    for (let i = 0; i < rest.length; i++) {
      const raw = rest[i].raw;
      // A bare first argument is the command, as with -Command.
      if (!raw.startsWith('-')) return found('PowerShell', i, rest.slice(i).map((w) => w.value).join(' '));
      const flag = raw.slice(1).toLowerCase().split(':')[0];
      if (!flag) continue;
      if ('encodedcommand'.startsWith(flag) || flag === 'ec') return { deny: '-EncodedCommand is not allowed' };
      if ('command'.startsWith(flag)) {
        if (i + 1 >= rest.length) return { deny: 'the code string after -Command cannot be found' };
        return found('PowerShell', i + 1, rest.slice(i + 1).map((w) => w.value).join(' '));
      }
      if ('file'.startsWith(flag)) return null;
      if (!raw.includes(':') && psTakesValue(flag)) i += 1;
    }
    return null;
  }
  if (name === 'cmd') {
    const at = rest.findIndex((w) => /^\/[ck]$/i.test(w.raw));
    if (at === -1) return null;
    if (at + 1 >= rest.length) return { deny: 'the code string after /c cannot be found' };
    return found(tool === 'Bash' ? 'Bash' : 'PowerShell', at + 1, rest.slice(at + 1).map((w) => w.value).join(' '));
  }
  return null;
}

// Programs that run the rest of their words as a command, with the options that
// take the next word as a value. env also takes NAME=value assignments.
const WRAPPER_VALUE_OPTIONS = {
  env: ['-u', '-C', '--unset', '--chdir'],
  nohup: [],
  timeout: ['-s', '-k', '--signal', '--kill-after'],
  nice: ['-n', '--adjustment'],
  sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U', '--user', '--group', '--close-from',
    '--chdir', '--host', '--prompt', '--role', '--type', '--command-timeout', '--other-user'],
  command: [],
  exec: ['-a'],
  xargs: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--max-args',
    '--max-procs', '--max-chars', '--process-slot-var'],
};

// The words left once leading wrappers (env, nohup, timeout, nice, sudo, command,
// exec, xargs) and their options are skipped: { words, wrapped, problem }.
export function stripWrappers(words) {
  let rest = words;
  let wrapped = false;
  while (rest.length > 0 && Object.hasOwn(WRAPPER_VALUE_OPTIONS, commandName(rest[0].value))) {
    const name = commandName(rest[0].value);
    const valued = WRAPPER_VALUE_OPTIONS[name];
    wrapped = true;
    let i = 1;
    while (i < rest.length) {
      const v = rest[i].value;
      if (name === 'env' && /^[A-Za-z_]\w*=/.test(v)) { i += 1; continue; }
      if (!v.startsWith('-')) break;
      i += 1;
      if (v === '--') break;
      if (name === 'env' && (/^-[^-]*S/.test(v) || v.startsWith('--split-string'))) {
        return { words: [], wrapped, problem: 'env -S splits a string into a command' };
      }
      if (valued.includes(v)) i += 1;
    }
    if (name === 'timeout') i += 1;
    rest = rest.slice(i);
  }
  return { words: rest, wrapped };
}

// Remove redirections (2>&1, 2>$null, *>$null, > file, < file) from a segment's words.
export function stripRedirections(words) {
  const kept = [];
  for (let i = 0; i < words.length; i++) {
    const raw = words[i].raw;
    if (!/^[0-9*]*[<>]/.test(raw)) kept.push(words[i]);
    else if (/^[0-9*]*(>>?|<)$/.test(raw)) i += 1;
  }
  return kept;
}
