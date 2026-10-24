const STORAGE_KEY = "bcsPractice.v1";
const BANK_URL = "./questions.json";
const EXPORT_FILENAME = "bcs-practice-progress.json";
const COUNT_CHOICES = [10, 20, 30, "all"];
const MIXED_MIN_QUESTIONS = 8;
const OPTION_LETTERS = ["A", "B", "C", "D"];

const state = {
  bank: null,
  questions: [],
  chapters: [],
  invalidQuestions: [],
  store: { attempts: [] },
  storeUnreadable: false,
  storeWritable: true,
  screen: "home",
  setup: null,
  session: null,
  timerId: null,
};

const els = {
  homeTitle: document.getElementById("home-title"),
  screenHome: document.getElementById("screen-home"),
  screenSetup: document.getElementById("screen-setup"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenSummary: document.getElementById("screen-summary"),

  bankLoading: document.getElementById("bank-loading"),
  bankError: document.getElementById("bank-error"),
  bankErrorText: document.getElementById("bank-error-text"),
  retryBank: document.getElementById("retry-bank"),
  bankWarning: document.getElementById("bank-warning"),
  bankWarningText: document.getElementById("bank-warning-text"),
  storeWarning: document.getElementById("store-warning"),
  homeBody: document.getElementById("home-body"),

  statTotal: document.getElementById("stat-total"),
  statAccuracy: document.getElementById("stat-accuracy"),
  statSeen: document.getElementById("stat-seen"),
  chapterGrid: document.getElementById("chapter-grid"),

  exportProgress: document.getElementById("export-progress"),
  importProgress: document.getElementById("import-progress"),
  importFile: document.getElementById("import-file"),
  importStatus: document.getElementById("import-status"),
  resetProgress: document.getElementById("reset-progress"),

  setupTitle: document.getElementById("setup-title"),
  setupSub: document.getElementById("setup-sub"),
  setupHint: document.getElementById("setup-hint"),
  countChoices: document.getElementById("count-choices"),
  startSession: document.getElementById("start-session"),
  setupBack: document.getElementById("setup-back"),

  quizContext: document.getElementById("quiz-context"),
  questionCounter: document.getElementById("question-counter"),
  quizScore: document.getElementById("quiz-score"),
  timerValue: document.getElementById("timer-value"),
  quizProgress: document.getElementById("quiz-progress"),
  stem: document.getElementById("question-stem"),
  optionList: document.getElementById("option-list"),
  feedback: document.getElementById("feedback"),
  nextQuestion: document.getElementById("next-question"),

  summaryTitle: document.getElementById("summary-title"),
  summaryPercent: document.getElementById("summary-percent"),
  summaryScore: document.getElementById("summary-score"),
  summaryTime: document.getElementById("summary-time"),
  summaryAvg: document.getElementById("summary-avg"),
  loTableBody: document.getElementById("lo-table-body"),
  missedList: document.getElementById("missed-list"),
  practiseAgain: document.getElementById("practise-again"),
  summaryHome: document.getElementById("summary-home"),

  bankVersions: document.getElementById("bank-versions"),
};

/* ---------- helpers ---------- */

function elem(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

function plural(count, singular, pluralWord) {
  return count === 1 ? singular : pluralWord || `${singular}s`;
}

function chapterTitle(n) {
  const chapter = state.chapters.find((entry) => entry.n === n);
  return chapter ? `Chapter ${n}: ${chapter.title}` : `Chapter ${n}`;
}

/* ---------- persistence ---------- */

function isValidAttempt(attempt) {
  return Boolean(attempt)
    && typeof attempt === "object"
    && typeof attempt.id === "string"
    && attempt.id.length > 0
    && typeof attempt.chapter === "number"
    && Number.isFinite(attempt.chapter)
    && typeof attempt.topic === "number"
    && Number.isFinite(attempt.topic)
    && typeof attempt.lo === "string"
    && typeof attempt.correct === "boolean"
    && typeof attempt.ts === "number"
    && Number.isFinite(attempt.ts)
    && typeof attempt.ms === "number"
    && Number.isFinite(attempt.ms);
}

function loadStore() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    state.storeWritable = false;
    console.warn(`[bcs-practice] localStorage is unavailable (${error.message}); progress will not persist.`);
    return;
  }

  if (raw === null) return;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.attempts)) {
      throw new Error("stored progress is not an object with an attempts array");
    }
    const badIndex = parsed.attempts.findIndex((attempt) => !isValidAttempt(attempt));
    if (badIndex !== -1) {
      throw new Error(`attempts[${badIndex}] is not a valid attempt record`);
    }
    state.store = { attempts: parsed.attempts };
  } catch (error) {
    state.storeUnreadable = true;
    state.store = { attempts: [] };
    console.warn(
      `[bcs-practice] Could not read saved progress: ${error.message}. ` +
      "Treating progress as empty; the stored value is left untouched until new progress is saved or reset.",
    );
  }
}

function saveStore() {
  if (!state.storeWritable) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
    state.storeUnreadable = false;
    els.storeWarning.hidden = true;
  } catch (error) {
    console.warn(`[bcs-practice] Could not save progress: ${error.message}`);
  }
}

function appendAttempt(attempt) {
  state.store.attempts.push(attempt);
  saveStore();
  renderStats();
}

function renderStats() {
  const attempts = state.store.attempts;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const seen = new Set(attempts.map((attempt) => attempt.id));

  els.statTotal.textContent = String(attempts.length);
  els.statAccuracy.textContent = attempts.length === 0
    ? "\u2014"
    : `${Math.round((correct / attempts.length) * 100)}%`;
  els.statSeen.textContent = String(seen.size);
  els.storeWarning.hidden = !state.storeUnreadable;
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.store, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILENAME;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setImportStatus(message, kind) {
  els.importStatus.textContent = message;
  els.importStatus.classList.toggle("is-error", kind === "error");
  els.importStatus.classList.toggle("is-ok", kind === "ok");
}

async function importProgress(file) {
  setImportStatus("", null);
  try {
    let text;
    try {
      text = await file.text();
    } catch (error) {
      throw new Error(`The file could not be read (${error.message}).`);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`The file is not valid JSON (${error.message}).`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.attempts)) {
      throw new Error("The file must be a JSON object with an attempts array.");
    }

    const badIndex = parsed.attempts.findIndex((attempt) => !isValidAttempt(attempt));
    if (badIndex !== -1) {
      throw new Error(`Attempt ${badIndex + 1} is missing required fields (id, chapter, topic, lo, correct, ts, ms).`);
    }

    state.store = { attempts: parsed.attempts };
    state.storeUnreadable = false;
    saveStore();
    renderStats();
    setImportStatus(
      `Imported ${parsed.attempts.length} ${plural(parsed.attempts.length, "attempt")}.`,
      "ok",
    );
  } catch (error) {
    setImportStatus(`Import failed: ${error.message} Nothing was changed.`, "error");
  }
}

function resetProgress() {
  const confirmed = window.confirm("Reset all saved progress? This cannot be undone.");
  if (!confirmed) return;
  state.store = { attempts: [] };
  state.storeUnreadable = false;
  saveStore();
  renderStats();
  setImportStatus("Progress reset.", "ok");
}

/* ---------- bank loading and validation ---------- */

function questionProblem(question) {
  if (!question || typeof question !== "object") return "not an object";
  if (typeof question.id !== "string" || !question.id) return "missing id";
  if (!Number.isInteger(question.chapter)) return "missing chapter number";
  if (!Number.isInteger(question.topic)) return "missing topic number";
  if (typeof question.lo !== "string" || !question.lo) return "missing LO label";
  if (typeof question.stem !== "string" || !question.stem.trim()) return "missing stem";
  if (typeof question.explanation !== "string" || !question.explanation.trim()) return "missing explanation";
  if (!Array.isArray(question.options)) return "options is not an array";
  if (question.options.length !== 6) return `expected 6 options, found ${question.options.length}`;

  const texts = new Set();
  let correctCount = 0;
  for (let index = 0; index < question.options.length; index += 1) {
    const option = question.options[index];
    const label = `option ${index + 1}`;
    if (!option || typeof option !== "object") return `${label} is not an object`;
    if (typeof option.text !== "string" || !option.text.trim()) return `${label} has no text`;
    if (texts.has(option.text)) return `${label} duplicates another option's text`;
    texts.add(option.text);
    if (option.correct === true) {
      correctCount += 1;
    } else if (option.correct !== false) {
      return `${label} is missing a boolean correct flag`;
    }
    if (option.note !== undefined && typeof option.note !== "string") {
      return `${label} has a non-string note`;
    }
  }
  if (correctCount !== 1) return `expected exactly 1 correct option, found ${correctCount}`;
  return null;
}

function normalizeQuestion(question) {
  return {
    id: question.id,
    chapter: question.chapter,
    topic: question.topic,
    lo: question.lo,
    stem: question.stem,
    explanation: question.explanation,
    options: question.options.map((option) => ({
      text: option.text,
      correct: option.correct === true,
      note: typeof option.note === "string" ? option.note : "",
    })),
  };
}

function applyBank(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Bank root is not an object.");
  }
  if (!Array.isArray(data.chapters) || data.chapters.length === 0) {
    throw new Error("Bank is missing a chapters array.");
  }
  if (!Array.isArray(data.questions)) {
    throw new Error("Bank is missing a questions array.");
  }

  const chapters = [];
  data.chapters.forEach((chapter, index) => {
    if (!chapter || typeof chapter !== "object" || !Number.isInteger(chapter.n) || typeof chapter.title !== "string" || !chapter.title.trim()) {
      throw new Error(`chapters[${index}] is missing a chapter number or title.`);
    }
    chapters.push({
      n: chapter.n,
      title: chapter.title,
      bookPages: typeof chapter.bookPages === "string" ? chapter.bookPages : "",
      weightPct: typeof chapter.weightPct === "number" ? chapter.weightPct : null,
    });
  });
  chapters.sort((a, b) => a.n - b.n);

  const questions = [];
  const invalid = [];
  data.questions.forEach((question, index) => {
    const problem = questionProblem(question);
    if (problem) {
      const id = question && typeof question.id === "string" && question.id ? question.id : `#${index}`;
      invalid.push({ id, problem });
    } else {
      questions.push(normalizeQuestion(question));
    }
  });

  state.bank = data;
  state.chapters = chapters;
  state.questions = questions;
  state.invalidQuestions = invalid;

  els.bankVersions.textContent = `Bank ${typeof data.bankVersion === "string" ? data.bankVersion : "unknown"} \u00b7 Syllabus ${typeof data.syllabusVersion === "string" ? data.syllabusVersion : "unknown"}`;

  renderBankWarning();
  renderChapterGrid();
  renderStats();

  els.bankLoading.hidden = true;
  els.bankError.hidden = true;
  els.homeBody.hidden = false;
}

function renderBankWarning() {
  const invalid = state.invalidQuestions;
  if (invalid.length === 0) {
    els.bankWarning.hidden = true;
    els.bankWarningText.textContent = "";
    return;
  }

  const shown = invalid.slice(0, 6).map((entry) => `${entry.id} (${entry.problem})`).join("; ");
  const extra = invalid.length > 6 ? `; and ${invalid.length - 6} more` : "";
  els.bankWarningText.textContent =
    `${invalid.length} ${plural(invalid.length, "question")} failed validation and ${invalid.length === 1 ? "was" : "were"} skipped: ${shown}${extra}. The rest of the bank still works.`;
  els.bankWarning.hidden = false;
}

async function loadBank() {
  els.bankError.hidden = true;
  els.bankWarning.hidden = true;
  els.homeBody.hidden = true;
  els.bankLoading.hidden = false;
  els.bankVersions.textContent = "";

  try {
    const response = await fetch(BANK_URL, { cache: "no-store" });
    if (!response.ok) {
      const statusText = response.statusText ? ` ${response.statusText}` : "";
      throw new Error(`HTTP ${response.status}${statusText}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error(`questions.json is not valid JSON (${error.message})`);
    }

    applyBank(data);
  } catch (error) {
    els.bankLoading.hidden = true;
    els.bankErrorText.textContent = `Could not load the question bank: ${error.message}`;
    els.bankError.hidden = false;
  }
}

/* ---------- home ---------- */

function questionCountForChapter(n) {
  return state.questions.filter((question) => question.chapter === n).length;
}

function renderChapterGrid() {
  clear(els.chapterGrid);

  const mixedCard = buildMixedCard();
  els.chapterGrid.append(mixedCard);

  for (const chapter of state.chapters) {
    const count = questionCountForChapter(chapter.n);
    const card = elem("button", "chapter-card");
    card.type = "button";
    card.dataset.chapter = String(chapter.n);

    card.append(elem("span", "chapter-number", `Chapter ${chapter.n}`));
    card.append(elem("h3", "chapter-title", chapter.title));

    const meta = elem(
      "p",
      "chapter-meta",
      count === 0 ? "No questions yet" : `${count} ${plural(count, "question")}`,
    );
    card.append(meta);

    if (count === 0) {
      card.disabled = true;
      card.setAttribute("aria-disabled", "true");
    } else {
      card.addEventListener("click", () => openSetup("chapter", chapter.n));
    }

    els.chapterGrid.append(card);
  }
}

function buildMixedCard() {
  const total = state.questions.length;
  const enabled = total >= MIXED_MIN_QUESTIONS;

  const card = elem("button", "chapter-card card-mixed");
  card.type = "button";
  card.append(elem("span", "chapter-number", "All chapters"));
  card.append(elem("h3", "chapter-title", "Mixed practice"));

  let metaText;
  if (enabled) {
    metaText = `${total} ${plural(total, "question")} across ${state.chapters.length} chapters`;
  } else {
    metaText = `Needs at least ${MIXED_MIN_QUESTIONS} questions (${total} in bank)`;
  }
  card.append(elem("p", "chapter-meta", metaText));

  if (enabled) {
    card.addEventListener("click", () => openSetup("mixed", null));
  } else {
    card.disabled = true;
    card.setAttribute("aria-disabled", "true");
  }

  return card;
}

/* ---------- setup ---------- */

function openSetup(kind, chapterNumber) {
  const pool = kind === "mixed"
    ? state.questions.slice()
    : state.questions.filter((question) => question.chapter === chapterNumber);

  if (pool.length === 0) return;

  state.setup = { kind, chapter: kind === "chapter" ? chapterNumber : null, pool };

  els.setupTitle.textContent = kind === "mixed" ? "Mixed practice" : chapterTitle(chapterNumber);
  els.setupSub.textContent = kind === "mixed"
    ? `${pool.length} ${plural(pool.length, "question")} drawn from all chapters.`
    : `Chapter ${chapterNumber} \u00b7 ${pool.length} ${plural(pool.length, "question")} available.`;

  renderCountChoices(pool.length);
  showScreen("setup");
}

function renderCountChoices(poolSize) {
  clear(els.countChoices);

  const firstEnabledCount = COUNT_CHOICES.find((choice) => choice !== "all" && poolSize >= choice);
  const defaultChoice = firstEnabledCount === undefined ? "all" : String(firstEnabledCount);

  for (const choice of COUNT_CHOICES) {
    const enabled = choice === "all" || poolSize >= choice;
    const label = elem("label", "count-choice");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "question-count";
    input.value = String(choice);
    input.disabled = !enabled;
    input.checked = enabled && String(choice) === defaultChoice;

    const text = choice === "all" ? `All (${poolSize})` : String(choice);
    label.append(input, elem("span", "", text));
    if (!enabled) {
      label.title = `Only ${poolSize} ${plural(poolSize, "question")} available`;
    }
    els.countChoices.append(label);
  }

  const disabledCounts = COUNT_CHOICES
    .filter((choice) => choice !== "all" && poolSize < choice)
    .map((choice) => String(choice));

  els.setupHint.textContent = disabledCounts.length === 0
    ? "Each session uses a shuffled queue, and no question repeats."
    : `Counts ${disabledCounts.join(", ")} need more questions than this pool has, so they are disabled. "All" uses every question in the pool (${poolSize}).`;
}

function startSession() {
  const setup = state.setup;
  if (!setup || setup.pool.length === 0) return;

  const checked = document.querySelector('input[name="question-count"]:checked');
  const chosen = checked ? checked.value : "all";
  const requestedCount = chosen === "all" ? setup.pool.length : Number(chosen);
  const count = Math.min(Number.isFinite(requestedCount) ? requestedCount : setup.pool.length, setup.pool.length);
  const queue = shuffle(setup.pool).slice(0, count);

  const now = performance.now();
  state.session = {
    kind: setup.kind,
    chapter: setup.chapter,
    queue,
    index: 0,
    answers: [],
    startedAt: now,
    current: null,
  };

  showScreen("quiz");
  startTimer();
  renderQuestion();
}

/* ---------- question flow ---------- */

function drawOptions(question) {
  const correctOption = question.options.find((option) => option.correct === true);
  const distractors = question.options.filter((option) => option !== correctOption);

  const seenTexts = new Set([correctOption.text]);
  const picked = [];
  for (const distractor of shuffle(distractors)) {
    if (seenTexts.has(distractor.text)) continue;
    seenTexts.add(distractor.text);
    picked.push(distractor);
    if (picked.length === 3) break;
  }

  // Validation rejects duplicate option text, so this is a defensive fallback only.
  if (picked.length < 3) {
    for (const distractor of distractors) {
      if (picked.includes(distractor)) continue;
      picked.push(distractor);
      if (picked.length === 3) break;
    }
  }

  return shuffle([correctOption, ...picked]);
}

function renderQuestion() {
  const session = state.session;
  const question = session.queue[session.index];
  const options = drawOptions(question);
  const now = performance.now();

  session.current = {
    question,
    options,
    answered: false,
    chosen: null,
    startedAt: now,
  };

  els.quizContext.textContent = `Chapter ${question.chapter} \u00b7 LO ${question.lo}`;
  els.questionCounter.textContent = `Question ${session.index + 1} of ${session.queue.length}`;
  els.quizScore.textContent = `${session.answers.filter((answer) => answer.correct).length} correct of ${session.answers.length} answered`;
  els.stem.textContent = question.stem;
  els.quizProgress.style.width = `${Math.round((session.index / session.queue.length) * 100)}%`;
  els.timerValue.textContent = formatDuration(now - session.startedAt);

  clear(els.feedback);
  els.nextQuestion.hidden = true;
  els.nextQuestion.textContent = "Next question";

  renderOptions(options);
  els.stem.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderOptions(options) {
  clear(els.optionList);

  options.forEach((option, index) => {
    const item = document.createElement("li");
    const button = elem("button", "option");
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-pressed", "false");

    const letter = elem("span", "option-letter", OPTION_LETTERS[index]);
    letter.setAttribute("aria-hidden", "true");

    const mark = elem("span", "option-mark");
    mark.setAttribute("aria-hidden", "true");

    button.append(letter, elem("span", "option-text", option.text), mark);
    button.addEventListener("click", () => answer(index));
    item.append(button);
    els.optionList.append(item);
  });
}

function answer(index) {
  const current = state.session && state.session.current;
  if (!current || current.answered) return;

  const buttons = Array.from(els.optionList.querySelectorAll("button.option"));
  const chosen = current.options[index];
  if (!chosen || !buttons[index]) return;

  current.answered = true;
  current.chosen = index;

  const ms = Math.max(0, Math.round(performance.now() - current.startedAt));
  const correctIndex = current.options.findIndex((option) => option.correct === true);
  const correctOption = current.options[correctIndex];
  const isCorrect = chosen.correct === true;
  const timestamp = Date.now();

  buttons.forEach((button, buttonIndex) => {
    button.disabled = true;
    const mark = button.querySelector(".option-mark");

    if (buttonIndex === correctIndex) {
      button.classList.add("is-correct");
      if (mark) mark.textContent = "\u2713";
    }
    if (buttonIndex === index) {
      button.setAttribute("aria-pressed", "true");
      if (!isCorrect) {
        button.classList.add("is-wrong");
        if (mark) mark.textContent = "\u2717";
      }
    }
  });

  if (isCorrect) {
    const chosenButton = buttons[index];
    chosenButton.append(elem("span", "sr-only", " Your answer, correct."));
  } else {
    buttons[index].append(elem("span", "sr-only", " Your answer, incorrect."));
    buttons[correctIndex].append(elem("span", "sr-only", " Correct answer."));
  }

  state.session.answers.push({
    question: current.question,
    chosenIndex: index,
    chosenText: chosen.text,
    options: current.options,
    correct: isCorrect,
    ms,
    ts: timestamp,
  });

  appendAttempt({
    id: current.question.id,
    chapter: current.question.chapter,
    topic: current.question.topic,
    lo: current.question.lo,
    correct: isCorrect,
    ts: timestamp,
    ms,
  });

  renderFeedback(current.question, chosen, correctOption, isCorrect, ms);
  els.quizScore.textContent = `${state.session.answers.filter((entry) => entry.correct).length} correct of ${state.session.answers.length} answered`;

  const isLast = state.session.index + 1 >= state.session.queue.length;
  els.nextQuestion.textContent = isLast ? "See summary" : "Next question";
  els.nextQuestion.hidden = false;
  els.nextQuestion.focus({ preventScroll: true });
}

function renderFeedback(question, chosen, correctOption, isCorrect, ms) {
  clear(els.feedback);

  const verdict = elem("p", `feedback-verdict ${isCorrect ? "is-correct" : "is-wrong"}`);
  const glyph = elem("span", "feedback-glyph", isCorrect ? "\u2713" : "\u2717");
  glyph.setAttribute("aria-hidden", "true");
  verdict.append(glyph, document.createTextNode(isCorrect ? " Correct" : " Incorrect"));
  verdict.append(elem("span", "feedback-time", ` \u00b7 ${formatSeconds(ms)} on this question`));

  const explanation = elem("p", "feedback-explanation", question.explanation);

  const noteEntries = [];
  if (isCorrect) {
    if (correctOption.note) {
      noteEntries.push({ label: "Why this is right", text: correctOption.note, kind: "note-correct" });
    }
  } else {
    if (chosen.note) {
      noteEntries.push({ label: `Your answer: ${chosen.text}`, text: chosen.note, kind: "note-chosen" });
    }
    if (correctOption.note) {
      noteEntries.push({ label: `Correct answer: ${correctOption.text}`, text: correctOption.note, kind: "note-correct" });
    }
  }

  els.feedback.append(verdict, explanation);

  if (noteEntries.length > 0) {
    const list = elem("dl", "feedback-notes");

    for (const entry of noteEntries) {
      const wrapper = elem("div", entry.kind);
      wrapper.append(elem("dt", "", entry.label), elem("dd", "", entry.text));
      list.append(wrapper);
    }
    els.feedback.append(list);
  }
}

function nextQuestion() {
  const session = state.session;
  if (!session || !session.current || !session.current.answered) return;

  if (session.index + 1 >= session.queue.length) {
    showSummary();
    return;
  }

  session.index += 1;
  renderQuestion();
}

/* ---------- timer ---------- */

function startTimer() {
  stopTimer();
  updateTimer();
  state.timerId = window.setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!state.session) return;
  els.timerValue.textContent = formatDuration(performance.now() - state.session.startedAt);
}

function stopTimer() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

/* ---------- summary ---------- */

function showSummary() {
  stopTimer();
  const session = state.session;
  if (!session) {
    showScreen("home");
    return;
  }

  const answered = session.answers.length;
  const correct = session.answers.filter((answer) => answer.correct).length;
  const percent = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  const totalMs = performance.now() - session.startedAt;
  const averageMs = answered === 0
    ? 0
    : session.answers.reduce((sum, answer) => sum + answer.ms, 0) / answered;

  els.summaryPercent.textContent = `${percent}%`;
  els.summaryScore.textContent = `${correct} / ${answered}`;
  els.summaryTime.textContent = formatDuration(totalMs);
  els.summaryAvg.textContent = formatSeconds(averageMs);

  renderLoTable(session.answers);
  renderMissedQuestions(session.answers);
  showScreen("summary");
}

function renderLoTable(answers) {
  clear(els.loTableBody);

  const groups = new Map();
  for (const answer of answers) {
    const key = answer.question.lo;
    const group = groups.get(key) || { lo: key, answered: 0, correct: 0 };
    group.answered += 1;
    if (answer.correct) group.correct += 1;
    groups.set(key, group);
  }

  const rows = Array.from(groups.values())
    .map((group) => ({
      ...group,
      accuracy: group.correct / group.answered,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered || a.lo.localeCompare(b.lo, undefined, { numeric: true }));

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(elem("th", "", `LO ${row.lo}`));
    tr.lastElementChild.scope = "row";
    tr.append(
      elem("td", "num", String(row.answered)),
      elem("td", "num", String(row.correct)),
      elem("td", "num", `${Math.round(row.accuracy * 100)}%`),
    );
    els.loTableBody.append(tr);
  }
}

function renderMissedQuestions(answers) {
  clear(els.missedList);
  const missed = answers.filter((answer) => !answer.correct);

  if (missed.length === 0) {
    els.missedList.append(elem("p", "section-hint", "No missed questions in this session."));
    return;
  }

  for (const answer of missed) {
    const question = answer.question;
    const correctIndex = answer.options.findIndex((option) => option.correct === true);
    const correctOption = answer.options[correctIndex];

    const card = elem("article", "missed-card");
    card.append(elem("h4", "", question.stem));
    card.append(elem("p", "missed-meta", `Chapter ${question.chapter} \u00b7 LO ${question.lo} \u00b7 ${formatSeconds(answer.ms)}`));

    const answersList = elem("dl", "missed-answers");
    const chosenRow = document.createElement("div");
    chosenRow.append(elem("dt", "", "Your answer"), elem("dd", "is-wrong", answer.chosenText));
    const correctRow = document.createElement("div");
    correctRow.append(elem("dt", "", "Correct answer"), elem("dd", "is-correct", correctOption.text));
    answersList.append(chosenRow, correctRow);

    card.append(answersList, elem("p", "", question.explanation));
    els.missedList.append(card);
  }
}

/* ---------- screens and events ---------- */

function showScreen(name) {
  state.screen = name;
  els.screenHome.hidden = name !== "home";
  els.screenSetup.hidden = name !== "setup";
  els.screenQuiz.hidden = name !== "quiz";
  els.screenSummary.hidden = name !== "summary";

  const focusTarget = {
    home: els.homeTitle,
    setup: els.setupTitle,
    quiz: els.stem,
    summary: els.summaryTitle,
  }[name];

  if (focusTarget) {
    focusTarget.setAttribute("tabindex", "-1");
    focusTarget.focus({ preventScroll: true });
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function backToHome() {
  stopTimer();
  state.session = null;
  state.setup = null;
  renderStats();
  showScreen("home");
}

function practiseAgain() {
  const session = state.session;
  if (!session) {
    showScreen("home");
    return;
  }
  const kind = session.kind;
  const chapter = session.chapter;
  state.session = null;
  openSetup(kind, chapter);
}

function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function handleKeydown(event) {
  if (state.screen !== "quiz" || !state.session || event.repeat) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;

  const current = state.session.current;
  if (!current) return;

  if (!current.answered) {
    const key = event.key.toLowerCase();
    let index = -1;

    if (key >= "1" && key <= "4") {
      index = Number(key) - 1;
    } else if (key.length === 1 && key >= "a" && key <= "d") {
      index = key.charCodeAt(0) - 97;
    }

    if (index >= 0 && index < 4) {
      event.preventDefault();
      answer(index);
    }
    return;
  }

  if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    nextQuestion();
  }
}

function bindEvents() {
  els.retryBank.addEventListener("click", loadBank);
  els.setupBack.addEventListener("click", backToHome);
  els.startSession.addEventListener("click", startSession);
  els.nextQuestion.addEventListener("click", nextQuestion);
  els.practiseAgain.addEventListener("click", practiseAgain);
  els.summaryHome.addEventListener("click", backToHome);

  els.exportProgress.addEventListener("click", exportProgress);
  els.importProgress.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    importProgress(file);
  });
  els.resetProgress.addEventListener("click", resetProgress);

  document.addEventListener("keydown", handleKeydown);
}

function init() {
  loadStore();
  renderStats();
  bindEvents();
  loadBank();
}

init();
