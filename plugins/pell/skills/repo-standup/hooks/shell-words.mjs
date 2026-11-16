// A small lexer for Bash and PowerShell command lines, for guard.mjs. It splits
// a command into segments of words the way both shells do, and reports what it
// cannot classify. It runs nothing. Node standard library only.
//
// parseShell(text) returns
//   segments: [{ words, piped, dynamicCall }]
//     words:       [{ raw, value }]  raw keeps quotes and escapes, value drops them
//     piped:       the segment follows a single `|`
//     dynamicCall: the segment starts with `&` followed by `$`, `(` or `{`
//   problems: strings naming input whose meaning differs between the shells
//
// Nested $( ), <( ) and >( ) are parsed too, and their segments are added to the
// same list, so a command hidden inside one is judged like any other.

export function parseShell(text) {
  const out = { segments: [], problems: [] };
  lex(String(text), out);
  return out;
}

// Index of the `)` matching the `(` at `open`, skipping quotes and escapes.
function matchParen(text, open) {
  let depth = 1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i += 1;
    else if (c === "'") i = text.indexOf("'", i + 1) === -1 ? text.length : text.indexOf("'", i + 1);
    else if (c === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i += 1;
    } else if (c === '(') depth += 1;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

function lex(text, out) {
  const n = text.length;
  let words = [];
  let cur = null;
  let piped = false;
  let dynamicCall = false;
  let i = 0;

  const word = () => (cur ??= { raw: '', value: '' });
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
  // A $( ), <( ) or >( ) starting at `at`, whose `(` is at `open`.
  const substitution = (at, open) => {
    const close = matchParen(text, open);
    const end = close === -1 ? n : close + 1;
    if (close === -1) out.problems.push('unmatched parenthesis');
    lex(text.slice(open + 1, close === -1 ? n : close), out);
    const w = word();
    w.raw += text.slice(at, end);
    w.value += text.slice(at, end);
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
      if (cur && (text[i - 1] === '>' || text[i - 1] === '<')) { cur.raw += c; cur.value += c; i += 1; continue; }
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
      out.problems.push('block comment');
      const end = text.indexOf('#>', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if ((c === '<' || c === '>') && next === '(') { substitution(i, i + 1); continue; }

    if (c === "'") {
      const w = word();
      const end = text.indexOf("'", i + 1);
      if (end === -1) {
        out.problems.push('unterminated quote');
        w.raw += text.slice(i);
        w.value += text.slice(i + 1);
        i = n;
      } else {
        w.raw += text.slice(i, end + 1);
        w.value += text.slice(i + 1, end);
        i = end + 1;
      }
      continue;
    }

    if (c === '"') {
      const w = word();
      w.raw += c;
      i += 1;
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === '"') { w.raw += d; i += 1; closed = true; break; }
        if (d === '\\') {
          const e = text[i + 1];
          if (e === '"') out.problems.push('escaped double quote');
          if (e !== undefined && '$"\\`\n'.includes(e)) { w.raw += d + e; w.value += e; i += 2; continue; }
        } else if (d === '`') {
          out.problems.push('backtick');
          const e = text[i + 1] ?? '';
          w.raw += d + e;
          w.value += e;
          i += 2;
          continue;
        } else if (d === '$' && text[i + 1] === '(') {
          const close = matchParen(text, i + 1);
          const end = close === -1 ? n : close + 1;
          if (close === -1) out.problems.push('unmatched parenthesis');
          lex(text.slice(i + 2, close === -1 ? n : close), out);
          w.raw += text.slice(i, end);
          w.value += text.slice(i, end);
          i = end;
          continue;
        }
        w.raw += d;
        w.value += d;
        i += 1;
      }
      if (!closed) out.problems.push('unterminated quote');
      continue;
    }

    if (c === '\\') {
      if (next === '\n') { i += 2; continue; }
      const w = word();
      w.raw += c + (next ?? '');
      w.value += next ?? '';
      i += 2;
      continue;
    }
    if (c === '`') {
      out.problems.push('backtick');
      const w = word();
      w.raw += c + (next ?? '');
      w.value += next ?? '';
      i += 2;
      continue;
    }
    if (c === '$' && next === '(') { substitution(i, i + 1); continue; }
    if (c === '$' && next === '{') {
      const end = text.indexOf('}', i);
      const stop = end === -1 ? n : end + 1;
      const w = word();
      w.raw += text.slice(i, stop);
      w.value += text.slice(i, stop);
      i = stop;
      continue;
    }

    const w = word();
    w.raw += c;
    w.value += c;
    i += 1;
  }
  endSegment(false);
}

// Remove redirections (2>&1, 2>$null, > file, < file) from a segment's words.
export function stripRedirections(words) {
  const kept = [];
  for (let i = 0; i < words.length; i++) {
    const raw = words[i].raw;
    if (!/^[0-9]*[<>]/.test(raw)) kept.push(words[i]);
    else if (/^[0-9]*(>>?|<)$/.test(raw)) i += 1;
  }
  return kept;
}
