// 出題ロジック・習熟度集計モジュール (仕様 4.2 / 4.6 / 9章準拠)

function buildQuestionPool(kanjiList, readingFilter = "both") {
  const pool = [];
  for (const k of kanjiList) {
    if ((readingFilter === "both" || readingFilter === "on") && k.on) {
      pool.push({
        uid: `${k.id}_on`,
        kanjiId: k.id,
        index: k.index,
        kanji: k.kanji,
        readingType: "on",
        readingLabel: "音読み",
        ...k.on,
      });
    }
    if ((readingFilter === "both" || readingFilter === "kun") && k.kun) {
      pool.push({
        uid: `${k.id}_kun`,
        kanjiId: k.id,
        index: k.index,
        kanji: k.kanji,
        readingType: "kun",
        readingLabel: "訓読み",
        ...k.kun,
      });
    }
  }
  return pool;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectQuestions({
  kanjiList,
  storage,
  mode = "new",
  count = 5,
  readingFilter = "both",
  customQuestions = null,
}) {
  if (customQuestions && customQuestions.length > 0) {
    return customQuestions.slice(0, count);
  }

  const allPool = buildQuestionPool(kanjiList, readingFilter);
  if (allPool.length === 0) return [];

  if (mode === "new") {
    // 未学習 (attempts === 0) → 学習回数が少ない順
    const unlearned = allPool.filter((q) => {
      const rec = storage.getReadingRecord(q.kanjiId, q.readingType);
      return rec.attempts === 0;
    });
    const learning = allPool.filter((q) => {
      const rec = storage.getReadingRecord(q.kanjiId, q.readingType);
      return rec.attempts > 0 && rec.mastery < 2;
    });
    const others = allPool.filter((q) => {
      const rec = storage.getReadingRecord(q.kanjiId, q.readingType);
      return rec.mastery >= 2;
    });

    const combined = [
      ...shuffleArray(unlearned),
      ...shuffleArray(learning),
      ...shuffleArray(others),
    ];
    return combined.slice(0, count);
  }

  if (mode === "review") {
    // ミスが多い問題・習熟度が低い学習中問題を優先
    const scored = shuffleArray(allPool).map((q) => {
      const rec = storage.getReadingRecord(q.kanjiId, q.readingType);
      let priority = 0;
      if (rec.attempts > 0 && rec.misses > 0) priority += 50 + rec.misses * 10;
      if (rec.mastery === 1) priority += 30;
      if (rec.attempts === 0) priority += 10;
      return { q, priority };
    });
    scored.sort((a, b) => b.priority - a.priority);
    return scored.slice(0, count).map((item) => item.q);
  }

  // random
  return shuffleArray(allPool).slice(0, count);
}

function getKanjiMasteryStatus(kanjiItem, storage) {
  const hasOn = Boolean(kanjiItem.on);
  const hasKun = Boolean(kanjiItem.kun);

  const onRec = hasOn ? storage.getReadingRecord(kanjiItem.id, "on") : null;
  const kunRec = hasKun ? storage.getReadingRecord(kanjiItem.id, "kun") : null;

  const onMastery = onRec ? onRec.mastery : null;
  const kunMastery = kunRec ? kunRec.mastery : null;

  const activeRecords = [onRec, kunRec].filter(Boolean);
  const totalAttempts = activeRecords.reduce((s, r) => s + r.attempts, 0);
  const totalMisses = activeRecords.reduce((s, r) => s + r.misses, 0);
  const totalCorrect = activeRecords.reduce((s, r) => s + r.correctKeys, 0);
  const allMastered =
    activeRecords.length > 0 && activeRecords.every((r) => r.mastery >= 2);
  const anyStarted = activeRecords.some((r) => r.attempts > 0);

  let overallStatus = "unlearned"; // unlearned | learning | mastered
  if (allMastered) {
    overallStatus = "mastered";
  } else if (anyStarted) {
    overallStatus = "learning";
  }

  const accuracy =
    totalCorrect + totalMisses > 0
      ? Math.round((totalCorrect / (totalCorrect + totalMisses)) * 100)
      : null;

  const isWeak =
    anyStarted &&
    ((totalMisses >= 3 && !allMastered) || (accuracy !== null && accuracy < 85));

  return {
    onMastery,
    kunMastery,
    overallStatus,
    isWeak,
    totalAttempts,
    totalMisses,
    accuracy,
    onRec,
    kunRec,
  };
}

function getGlobalLearningSummary(kanjiList, storage) {
  let masteredKanjiCount = 0;
  let learningKanjiCount = 0;
  let weakKanjiCount = 0;

  for (const k of kanjiList) {
    const st = getKanjiMasteryStatus(k, storage);
    if (st.overallStatus === "mastered") masteredKanjiCount += 1;
    else if (st.overallStatus === "learning") learningKanjiCount += 1;
    if (st.isWeak) weakKanjiCount += 1;
  }

  return {
    totalKanji: kanjiList.length,
    masteredKanjiCount,
    learningKanjiCount,
    unlearnedKanjiCount: kanjiList.length - masteredKanjiCount - learningKanjiCount,
    weakKanjiCount,
  };
}
