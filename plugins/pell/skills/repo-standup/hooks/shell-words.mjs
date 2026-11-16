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

export function parseShell(text, shell = 'bash') {
  const out = { segments: [], problems: [] };
  const ps = shell === 'powershell';
  let source = String(text);
  if (ps) source = source.replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  lex(source, out, ps);
  return out;
}

// Index of the `)` matching the `(` at `open`, skipping quotes and escapes; -1 when unmatched.
function matchParen(text, open) {
  let depth = 1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' || c === '`') i += 1;
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
    const close = matchParen(text, open);
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

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    if (c === ' ' || c === '\t') { endWord(); i += 1; continue; }
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
            const close = matchParen(body, at + 1);
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
  endSegment(false);
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
