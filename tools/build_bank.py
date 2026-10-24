"""Build questions.json from the markdown question bank in bank/.

The markdown files are the source of truth. This script parses every bank/*.md,
validates the blocks, and writes questions.json at the repository root.

Run from the repository root:

    python tools/build_bank.py

Any validation problem is reported with the file, the question id and the
specific problem, and the script exits non-zero without writing the JSON.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK_DIR = ROOT / "bank"
OUTPUT = ROOT / "questions.json"

OPTIONS_PER_QUESTION = 6
OPTIONS_SHOWN = 4
BANK_VERSION = "0.1.0"
SYLLABUS_VERSION = "4.1"

# Chapter titles and page ranges follow the syllabus mapping. Page ranges after
# chapter 3 are provisional and have not been checked against the printed book.
CHAPTERS = [
    (1, "What is Business Analysis?", "1-24", 5),
    (2, "The Competencies of a Business Analyst", "25-47", 2.5),
    (3, "The Strategic Context for Business Analysis", "48-70", 7.5),
    (4, "The Business Analysis Service Framework", "71-100", 2.5),
    (5, "Investigating the Business Situation", "101-140", 12.5),
    (6, "Analysing and Managing Stakeholders", "141-166", 10),
    (7, "Improving Business Services and Processes", "167-206", 12.5),
    (8, "Defining the Solution", "207-232", 7.5),
    (9, "Making the Business Case", "233-262", 5),
    (10, "Establishing the Requirements", "263-292", 10),
    (11, "Documenting and Modelling Requirements", "293-330", 10),
    (12, "Validating and Managing Requirements", "331-352", 5),
    (13, "Delivering the Requirements", "353-374", 5),
    (14, "Delivering the Business Solution", "375-398", 5),
]

REQUIRED_FIELDS = ("chapter", "topic", "lo", "stem")
OPTION_PREFIXES = {"+": True, "-": False}
SEPARATOR = re.compile(r"^\s*-{3,}\s*$")
ID_PATTERN = re.compile(r"^ch(\d+)-(\d+\.\d+)-(\d{2})$")


class BuildError(Exception):
    """A validation problem tied to a file, a question and a message."""


def split_blocks(text: str) -> list[list[str]]:
    """Split a markdown file into blocks on lines of three or more dashes."""
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in text.splitlines():
        if SEPARATOR.match(line):
            if current:
                blocks.append(current)
            current = []
        else:
            current.append(line)
    if current:
        blocks.append(current)
    return blocks


def parse_block(lines: list[str], source: Path, block_number: int) -> dict | None:
    """Parse one question block. Returns None for a comment-only block."""
    trimmed = [line for line in lines if line.strip()]
    if not trimmed:
        return None
    if trimmed[0].lstrip().startswith("#"):
        return None

    header = trimmed[0].strip()
    if not header.startswith("==="):
        raise BuildError(
            f"{source}: block {block_number}: expected a '=== id: <question id>' header, found {header!r}"
        )
    header_value = header[3:].strip()
    if not header_value.startswith("id:"):
        raise BuildError(
            f"{source}: block {block_number}: header must read '=== id: <question id>', found {header!r}"
        )
    question_id = header_value[len("id:"):].strip()
    if not question_id:
        raise BuildError(f"{source}: block {block_number}: header is missing a question id")

    fields: dict[str, str] = {}
    options: list[dict] = []
    explanations: list[str] = []

    for raw in trimmed[1:]:
        line = raw.strip()
        if not line:
            continue
        if line[0] in OPTION_PREFIXES:
            body = line[1:].strip()
            if "|" not in body:
                raise BuildError(
                    f"{source}: {question_id}: option line needs 'text | note', found {line!r}"
                )
            option_text, note = (part.strip() for part in body.split("|", 1))
            if not option_text:
                raise BuildError(f"{source}: {question_id}: option line has no text: {line!r}")
            if not note:
                raise BuildError(f"{source}: {question_id}: option {option_text!r} has no note")
            options.append(
                {"text": option_text, "correct": OPTION_PREFIXES[line[0]], "note": note}
            )
            continue
        if ":" not in line:
            raise BuildError(
                f"{source}: {question_id}: line is neither a field, an option (+/-) nor 'why:', found {line!r}"
            )
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key == "why":
            explanations.append(value)
        elif key in REQUIRED_FIELDS or key == "id":
            if key in fields:
                raise BuildError(f"{source}: {question_id}: duplicate field {key!r}")
            if not value:
                raise BuildError(f"{source}: {question_id}: field {key!r} is empty")
            fields[key] = value
        else:
            raise BuildError(f"{source}: {question_id}: unknown field {key!r}")

    if "id" in fields:
        raise BuildError(
            f"{source}: {question_id}: id must be declared on the '===' header line, not as a field"
        )

    for required in REQUIRED_FIELDS:
        if required not in fields:
            raise BuildError(f"{source}: {question_id}: missing required field {required!r}")

    if len(explanations) > 1:
        raise BuildError(
            f"{source}: {question_id}: more than one 'why:' line (found {len(explanations)})"
        )
    if not explanations or not explanations[0]:
        raise BuildError(f"{source}: {question_id}: missing or empty 'why:' explanation")
    if not fields["stem"]:
        raise BuildError(f"{source}: {question_id}: stem is empty")

    match = ID_PATTERN.match(question_id)
    if not match:
        raise BuildError(
            f"{source}: {question_id}: id must match ch<chapter>-<lo>-<nn>, for example ch1-1.2-03"
        )
    chapter_from_id = int(match.group(1))
    lo_from_id = match.group(2)
    try:
        chapter = int(fields["chapter"])
        topic = int(fields["topic"])
    except ValueError:
        raise BuildError(
            f"{source}: {question_id}: chapter and topic must be whole numbers"
        ) from None
    if chapter != chapter_from_id:
        raise BuildError(
            f"{source}: {question_id}: chapter {chapter} does not match the id"
        )
    if lo_from_id != fields["lo"]:
        raise BuildError(f"{source}: {question_id}: lo {fields['lo']!r} does not match the id")

    correct = [option for option in options if option["correct"]]
    if len(correct) != 1:
        raise BuildError(
            f"{source}: {question_id}: expected exactly one correct option (+), found {len(correct)}"
        )
    if len(options) < OPTIONS_PER_QUESTION:
        raise BuildError(
            f"{source}: {question_id}: expected at least {OPTIONS_PER_QUESTION} options, found {len(options)}"
        )
    if len(options) > OPTIONS_PER_QUESTION:
        raise BuildError(
            f"{source}: {question_id}: expected {OPTIONS_PER_QUESTION} options, found {len(options)}"
        )

    seen: dict[str, str] = {}
    for option in options:
        key = " ".join(option["text"].split()).casefold()
        if key in seen:
            raise BuildError(
                f"{source}: {question_id}: duplicated option text {option['text']!r}"
            )
        seen[key] = option["text"]

    return {
        "id": question_id,
        "chapter": chapter,
        "topic": topic,
        "lo": fields["lo"],
        "stem": fields["stem"],
        "options": options,
        "explanation": explanations[0],
    }


def load_questions() -> tuple[list[dict], list[str], list[str]]:
    """Read and validate every bank/*.md file. Returns questions, problems and sources."""
    sources = sorted(BANK_DIR.glob("*.md"))
    if not sources:
        return [], [f"{BANK_DIR}: no markdown files found"], []

    questions: list[dict] = []
    problems: list[str] = []
    seen_ids: dict[str, Path] = {}

    for source in sources:
        try:
            text = source.read_text(encoding="utf-8-sig")
        except OSError as error:
            problems.append(f"{source}: cannot be read ({error})")
            continue

        blocks = split_blocks(text)
        for block_number, lines in enumerate(blocks, start=1):
            try:
                question = parse_block(lines, source, block_number)
            except BuildError as error:
                problems.append(str(error))
                continue
            if question is None:
                continue
            if question["id"] in seen_ids:
                problems.append(
                    f"{source}: {question['id']}: duplicate question id, already defined in {seen_ids[question['id']]}"
                )
                continue
            seen_ids[question["id"]] = source
            questions.append(question)

    return questions, problems, [source.relative_to(ROOT).as_posix() for source in sources]


def build_document(questions: list[dict], sources: list[str]) -> dict:
    return {
        "bankVersion": BANK_VERSION,
        "syllabusVersion": SYLLABUS_VERSION,
        "generatedFrom": ", ".join(sources),
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "optionsPerQuestion": OPTIONS_PER_QUESTION,
        "optionsShown": OPTIONS_SHOWN,
        "chapters": [
            {"n": n, "title": title, "bookPages": pages, "weightPct": weight}
            for n, title, pages, weight in CHAPTERS
        ],
        "questions": questions,
    }


def print_summary(questions: list[dict]) -> None:
    by_lo = Counter(question["lo"] for question in questions)
    by_chapter = Counter(question["chapter"] for question in questions)
    by_option_count = Counter(len(question["options"]) for question in questions)

    print(f"Total questions: {len(questions)}")
    print("Per LO: " + ", ".join(f"{lo} {by_lo[lo]}" for lo in sorted(by_lo)))
    print("Per chapter: " + ", ".join(f"{ch} {by_chapter[ch]}" for ch in sorted(by_chapter)))
    print(
        "optionsPerQuestion: "
        + ", ".join(f"{count} options x {by_option_count[count]}" for count in sorted(by_option_count))
    )


def main() -> int:
    questions, problems, sources = load_questions()
    if problems:
        print("Build failed:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        print(f"{len(problems)} problem(s) found; questions.json was not written.", file=sys.stderr)
        return 1

    document = build_document(questions, sources)
    OUTPUT.write_text(
        json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {OUTPUT.relative_to(ROOT).as_posix()} from {len(sources)} markdown file(s).")
    print_summary(questions)
    return 0


if __name__ == "__main__":
    sys.exit(main())
