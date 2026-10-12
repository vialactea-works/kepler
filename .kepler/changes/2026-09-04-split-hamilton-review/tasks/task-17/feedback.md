# Code Feedback: Task 17 — Centralize exact active-task resolution

## Pass 1 — 2026-09-05

Base: ac47b1fb080dd65981e4846832e87168d3fb308f
Head: b5312e269fcad00c81925e047cf9622ad4d673ee
Verdict: approved

### Blocking

- None.

### Suggestions

- Verified the shared installed parser is sourced relative to each helper, rejects duplicate positive task ids, ignores HTML-commented headings, recognizes only the canonical abandonment suffix, avoids Bash 4-only constructs, and is installed and reported by setup; the focused 217-test suite and shell syntax checks pass.
