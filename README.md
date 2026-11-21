# makefun-csv

[![make.fun bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![make.fun rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kuroma6666/makefun-csv/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![make.fun reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kuroma6666/makefun-csv/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

Entry for the make.fun bounty [Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

A fast drop-in replacement for csv-reader 1.0.0, built for make.fun's
`csv-reader-speed-01-run-20261121` bounty ("Read broken CSV files faster").

`main.ts` is the house baseline's driver, kept byte-identical: it reads
`/input/cases.json`, answers each case with `run(input)` from `solve.js`, and
writes `/output/answers.json`. Outside a container, `MAKEFUN_INPUT_DIR` and
`MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`.

`solve.js` returns exactly csv-reader 1.0.0's answer (`{columns, rows, errors}`)
for every input, including its broken-row policy (stray CRs, quote junk,
unterminated quotes, short/long rows and their error records). It is faster
because fields are located by scanning char codes in one tight loop and
extracted with a single slice each, instead of being built character by
character; quoted fields jump quote to quote with `indexOf` and only take a
transforming path when a CR or a doubled quote actually occurs.

No dependencies. Node 22 runs it as `node main.ts`.
