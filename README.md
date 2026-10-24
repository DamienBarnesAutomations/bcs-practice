# BCS Business Analysis practice

An unofficial, single-page study aid for the BCS Foundation Certificate in Business Analysis. It reads a question bank from `./questions.json`, lets you practise one chapter or a mix of all chapters, and records each answer locally in your browser.

Plain HTML, CSS and ES modules. No framework, no build step, no dependencies, no network calls apart from fetching its own question bank.

## Run locally

From this directory:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. A static server is required because the page fetches `questions.json`, which browsers block on `file://` URLs.

## Deploy to GitHub Pages

1. Push the contents of this directory to a repository.
2. In the repository settings, open **Pages** and set the source to the branch and folder that contains `index.html` (for example `main` / root).
3. GitHub serves the app at `https://<user>.github.io/<repo>/`.

All asset paths are relative (`./styles.css`, `./app.js`, `./questions.json`), so the app works from a repository subpath without changes.

## How the six-option pool works

Every question in the bank has six options: exactly one correct answer and five distractors. Each time a question is shown, the app keeps the correct option, picks three distinct distractors at random, shuffles the four, and labels them A-D. The same question therefore looks different across sessions, while always containing the right answer. Question order is shuffled too, and a session never repeats a question.

## Adding questions

`questions.json` is generated, not hand-edited. Author questions in `bank/ch01.md` (one `===` block per question, `+` marks the correct option, `-` marks a distractor, `why:` is the explanation), then rebuild:

```sh
python tools/build_bank.py
```

The builder refuses to write `questions.json` if a block has fewer than six options, more than one correct answer, duplicate option text, a duplicate id, or a missing field. It prints the count per learning outcome. Copy the block format from `bank/ch01.md`; adding chapter 2 means a new `bank/ch02.md`.

## Where progress is stored

Progress lives in `localStorage` under the key `bcsPractice.v1`, as a single object:

```json
{ "attempts": [{ "id": "ch1-1.1-01", "chapter": 1, "topic": 1, "lo": "1.1", "correct": true, "ts": 1761264000000, "ms": 8400 }] }
```

Each answer appends one attempt. Home-screen statistics and session summaries are recalculated from those attempts; no derived figures are stored. Export writes `bcs-practice-progress.json`; import replaces the store only after validating the file.

## Attribution

Unofficial study aid. Not affiliated with or endorsed by BCS, The Chartered Institute for IT. Syllabus structure (c) BCS.
