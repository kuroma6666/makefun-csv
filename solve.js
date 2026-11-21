// Faster drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01).
//
// Returns exactly csv-reader's answer for every input {text, header}: {columns, rows, errors},
// under csv-reader's broken-row policy:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it
//     one quote, and each CRLF or lone CR inside it read as LF; what follows its closing quote,
//     up to the next comma or line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character and the text after it is read
//     again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds the records after
//     it, each padded ("", short_row, with fields: its count) or cut (long_row, with extra: the
//     cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside a quoted field counted), row its record's index in
//     rows, null for the header.
//
// Speed: fields are located by scanning char codes in one tight loop and extracted with a
// single slice each (no per-character string building, no per-field result objects); quoted
// fields jump quote to quote with indexOf and only fall back to a transforming path when a
// CR or a doubled quote actually occurs. Pure: nothing kept from one call to the next.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = n > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, and how it ended (0 comma, 1 line break, 2 end of text).
  let fVal = '';
  let fEnd = 2;
  // Characters kept by the last readU call (the initial value does not count).
  let uAdded = 0;

  // Reads an unquoted field from pos, starting from value v ('' normally, '"' for the re-read
  // of an unterminated quote). Sets fEnd and uAdded; returns the field's value.
  function readU(v) {
    const start = pos;
    let i = pos;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44) {
        pos = i + 1;
        fEnd = 0;
        uAdded = i - start;
        return v === '' ? text.slice(start, i) : v + text.slice(start, i);
      }
      if (c === 10) {
        pos = i + 1;
        line += 1;
        fEnd = 1;
        uAdded = i - start;
        return v === '' ? text.slice(start, i) : v + text.slice(start, i);
      }
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) {
          pos = i + 2;
          line += 1;
          fEnd = 1;
          uAdded = i - start;
          return v === '' ? text.slice(start, i) : v + text.slice(start, i);
        }
        // A stray CR: dropped, an error, and the field goes on in segments.
        let out = v === '' ? text.slice(start, i) : v + text.slice(start, i);
        let added = i - start;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        i += 1;
        let seg = i;
        while (i < n) {
          const d = text.charCodeAt(i);
          if (d === 44) {
            pos = i + 1;
            fEnd = 0;
            uAdded = added + (i - seg);
            return out + text.slice(seg, i);
          }
          if (d === 10) {
            pos = i + 1;
            line += 1;
            fEnd = 1;
            uAdded = added + (i - seg);
            return out + text.slice(seg, i);
          }
          if (d === 13) {
            if (text.charCodeAt(i + 1) === 10) {
              pos = i + 2;
              line += 1;
              fEnd = 1;
              uAdded = added + (i - seg);
              return out + text.slice(seg, i);
            }
            out += text.slice(seg, i);
            added += i - seg;
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            i += 1;
            seg = i;
            continue;
          }
          i += 1;
        }
        pos = n;
        fEnd = 2;
        uAdded = added + (n - seg);
        return out + text.slice(seg, n);
      }
      i += 1;
    }
    pos = n;
    fEnd = 2;
    uAdded = n - start;
    return v === '' ? text.slice(start, n) : v + text.slice(start, n);
  }

  // What follows a closing quote, pos just past it and fVal holding the quoted content:
  // a comma, a line break or the end ends the field; anything else is appended as it
  // stands by an unquoted read (quote_junk when that read kept a character).
  function afterQuote() {
    if (pos >= n) {
      fEnd = 2;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnd = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnd = 1;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnd = 1;
      return;
    }
    const v = readU(fVal);
    if (uAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    fVal = v;
  }

  // The transforming quoted read, for a field whose quoted text holds a CR: slices are
  // joined at each special character, CR and CRLF each becoming one LF.
  function readQuotedSlow(open, openLine) {
    const parts = [];
    let i = open + 1;
    let seg = i;
    let closed = false;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          parts.push(text.slice(seg, i), '"');
          i += 2;
          seg = i;
          continue;
        }
        parts.push(text.slice(seg, i));
        i += 1;
        closed = true;
        break;
      }
      if (c === 13) {
        parts.push(text.slice(seg, i), '\n');
        line += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
        seg = i;
        continue;
      }
      if (c === 10) line += 1;
      i += 1;
    }
    if (!closed) {
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      fVal = readU('"');
      return;
    }
    pos = i;
    fVal = parts.join('');
    afterQuote();
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let i = open + 1;
    let segStart = i;
    let built = null;
    while (i < n) {
      const q = text.indexOf('"', i);
      if (q === -1) break;
      const r = text.indexOf('\r', segStart);
      if (r !== -1 && r < q) {
        // The slow path recounts the field's lines from its opening line.
        line = openLine;
        readQuotedSlow(open, openLine);
        return;
      }
      for (let k = text.indexOf('\n', segStart); k !== -1 && k < q; k = text.indexOf('\n', k + 1)) line += 1;
      if (text.charCodeAt(q + 1) === 34) {
        built = (built === null ? text.slice(segStart, q) : built + text.slice(segStart, q)) + '"';
        i = q + 2;
        segStart = i;
        continue;
      }
      fVal = built === null ? text.slice(segStart, q) : built + text.slice(segStart, q);
      pos = q + 1;
      afterQuote();
      return;
    }
    // The quote never closes: a literal character, and the text after it read again unquoted.
    pos = open + 1;
    line = openLine;
    errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
    fVal = readU('"');
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = pos < n && text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else fVal = readU('');
      fields.push(fVal);
    } while (fEnd === 0);

    // A line that held only stray CRs is left with no characters: no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
