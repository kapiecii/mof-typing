// もふタイ！ メインアプリケーションコントローラ (全7画面統合・Canvas連動・iframe画像埋め込み)
class MofuTypingApp {
  constructor() {
    this.storage = new StorageManager();
    this.sound = new SoundManager(() => this.storage.settings);
    this.kanjiList = KANJI_DATA;

    this.currentScreen = "home";
    // 学習モード選択状態
    this.selectedMode = "new"; // new | review | random
    this.selectedCount = this.storage.settings.defaultCount || 5;
    this.selectedReading = "both"; // both | on | kun
    this.selectedDifficulty = "normal"; // normal | challenge

    // タイピングセッション状態
    this.activeQuestions = [];
    this.currentQIndex = 0;
    this.typingSession = null;
    this.waitingNextEnter = false;
    this.directIframeUrlMode = false;

    // 今回のセット集計
    this.sessionStats = null;
    this.lastSessionConfig = null;

    // Canvas レンダラー
    this.renderers = {};
  }

  async init() {
    // http/https サーバー経由で起動された場合のみ data/kanji.json を fetch（file:// 直接起動時は CORS エラーを防ぐため KANJI_DATA を直接使用）
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      try {
        const res = await fetch("./data/kanji.json");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            this.kanjiList = json;
          }
        }
      } catch (_) {
        // KANJI_DATA にフォールバック
      }
    }

    this.applySettingsToDOM();
    this.setupCanvases();
    this.dictionary = new DictionaryController({
      kanjiList: this.kanjiList,
      storage: this.storage,
      onStartPractice: (customQs) => {
        this.startTypingSession({
          mode: "custom",
          count: customQs.length,
          readingFilter: "both",
          difficulty: "normal",
          customQuestions: customQs,
        });
      },
    });

    this.bindEvents();
    this.showScreen("home");
  }

  setupCanvases() {
    const getChar = () => this.storage.character;
    const homeCanvas = document.getElementById("home-canvas");
    const typingCanvas = document.getElementById("typing-canvas");
    const resultCanvas = document.getElementById("result-canvas");
    const careCanvas = document.getElementById("care-canvas");

    if (homeCanvas) {
      this.renderers.home = new MofuCanvasRenderer(homeCanvas, getChar);
    }
    if (typingCanvas) {
      this.renderers.typing = new MofuCanvasRenderer(typingCanvas, getChar);
      this.renderers.typing.showProgressTrack = true;
    }
    if (resultCanvas) {
      this.renderers.result = new MofuCanvasRenderer(resultCanvas, getChar);
    }
    if (careCanvas) {
      this.renderers.care = new MofuCanvasRenderer(careCanvas, getChar);
    }
  }

  applySettingsToDOM() {
    const s = this.storage.settings;
    document.body.classList.toggle("font-large", s.fontSize === "large");
    this.sound.updateBgmState();
  }

  updateHeaderUI() {
    const ptEl = document.getElementById("header-points");
    const lvEl = document.getElementById("header-level");
    const homeBtn = document.getElementById("header-home-btn");

    if (ptEl) ptEl.textContent = `${this.storage.player.currentPoints} pt`;
    if (lvEl) lvEl.textContent = `Lv.${this.storage.character.level} ${this.storage.character.name}`;
    if (homeBtn) {
      homeBtn.style.display = this.currentScreen === "home" ? "none" : "inline-flex";
    }
  }

  showScreen(screenId) {
    this.currentScreen = screenId;
    document.querySelectorAll(".screen").forEach((el) => {
      el.classList.toggle("active", el.id === `screen-${screenId}`);
    });
    this.updateHeaderUI();

    if (screenId === "home") this.renderHomeScreen();
    else if (screenId === "mode") this.renderModeScreen();
    else if (screenId === "care") this.renderCareScreen();
    else if (screenId === "dictionary") this.renderDictionaryScreen();
    else if (screenId === "settings") this.renderSettingsScreen();
  }

  // 01. ホーム画面
  renderHomeScreen() {
    const char = this.storage.character;
    const player = this.storage.player;
    const summary = getGlobalLearningSummary(this.kanjiList, this.storage);
    const reqExp = getRequiredExpForLevel(char.level);
    const expPct = Math.min(100, Math.round((char.exp / reqExp) * 100));

    document.getElementById("home-char-name").textContent = char.name;
    document.getElementById("home-char-level").textContent = `Lv.${char.level}`;
    document.getElementById("home-exp-text").textContent = `${char.exp} / ${reqExp} EXP`;
    document.getElementById("home-exp-bar").style.width = `${expPct}%`;

    document.getElementById("home-stat-mastered").textContent = `${summary.masteredKanjiCount} / ${summary.totalKanji}`;
    document.getElementById("home-stat-today").textContent = `${player.todayCount} 問`;
    document.getElementById("home-stat-points").textContent = `${player.currentPoints} pt`;

    const greetings = [
      "今日もいっしょに回し車で走ろう！🌰",
      "タイピングするとボクが元気よく走るよ！",
      `今は ${summary.masteredKanjiCount} 個の漢字をマスターしたね！`,
      "木の実を食べるとレベルアップしちゃうよ♪",
    ];
    document.getElementById("home-speech-text").textContent =
      greetings[Math.floor(Math.random() * greetings.length)];
  }

  // 02. 学習モード選択画面
  renderModeScreen() {
    document.querySelectorAll(".mode-option-card").forEach((card) => {
      card.classList.toggle("selected", card.dataset.mode === this.selectedMode);
    });
    document.querySelectorAll("[data-count-choice]").forEach((btn) => {
      btn.classList.toggle("selected", Number(btn.dataset.countChoice) === this.selectedCount);
    });
    document.querySelectorAll("[data-reading-choice]").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.readingChoice === this.selectedReading);
    });
    document.querySelectorAll("[data-diff-choice]").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.diffChoice === this.selectedDifficulty);
    });
  }

  // 03. タイピング開始
  startTypingSession(config) {
    this.lastSessionConfig = { ...config };
    const questions = selectQuestions({
      kanjiList: this.kanjiList,
      storage: this.storage,
      mode: config.mode,
      count: config.count,
      readingFilter: config.readingFilter,
      customQuestions: config.customQuestions || null,
    });

    if (questions.length === 0) {
      alert("条件に合う問題がありませんでした。");
      return;
    }

    this.activeQuestions = questions;
    this.currentQIndex = 0;
    this.sessionStats = {
      mode: config.mode,
      difficulty: config.difficulty,
      totalQuestions: questions.length,
      clearedCount: 0,
      totalCorrectKeys: 0,
      totalMisses: 0,
      maxCombo: 0,
      currentCombo: 0,
      pointsEarned: 0,
      expEarned: 0,
      startLevel: this.storage.character.level,
      newlyLearnedKanji: [],
      reviewNeededQuestions: [],
    };

    this.showScreen("typing");
    if (this.renderers.typing) {
      this.renderers.typing.setState("idle");
      this.renderers.typing.progressRatio = 0;
    }
    this.loadCurrentQuestion();
  }

  loadCurrentQuestion() {
    const q = this.activeQuestions[this.currentQIndex];
    if (!q) {
      this.finishTypingSession();
      return;
    }

    this.waitingNextEnter = false;
    this.typingSession = new TypingSession(q.typingKana || q.kana);

    // 進捗表示
    document.getElementById("typing-q-progress").textContent = `問題 ${this.currentQIndex + 1} / ${this.activeQuestions.length}`;
    if (this.renderers.typing) {
      this.renderers.typing.progressRatio = this.currentQIndex / this.activeQuestions.length;
    }

    // 対象漢字・音訓バッジ
    const badgeEl = document.getElementById("typing-reading-badge");
    badgeEl.textContent = q.readingLabel;
    badgeEl.className = `reading-type-badge ${q.readingType}`;

    document.getElementById("typing-kanji-char").textContent = q.kanji;
    document.getElementById("typing-kanji-yomi").textContent = `読み：${q.yomi}`;

    // 例文と読みがな
    document.getElementById("typing-sentence-html").innerHTML = q.sentenceHtml;

    // イメージ画像を iframe に埋め込み表示
    const iframeEl = document.getElementById("typing-image-iframe");
    updateIframeImage(iframeEl, q, this.directIframeUrlMode);

    const srcLinkWrap = document.getElementById("typing-image-source");
    if (q.sourceUrl) {
      srcLinkWrap.innerHTML = `出典: <a href="${q.sourceUrl}" target="_blank" rel="noopener noreferrer">${new URL(q.sourceUrl).hostname}</a>`;
    } else {
      srcLinkWrap.textContent = "オリジナルイラスト表示";
    }

    document.getElementById("typing-next-btn").style.display = "none";
    document.getElementById("typing-speech-bubble").textContent =
      "ローマ字でキーをおしてね！エゾリスが走るよ🐿️";

    // 音声読み上げ
    speakText(`${q.kanji}。${q.sentence}`, this.storage.settings.speech);

    this.updateTypingView();
  }

  updateTypingView(missFlash = false) {
    if (!this.typingSession) return;
    const disp = this.typingSession.getDisplayState();
    const q = this.activeQuestions[this.currentQIndex];

    // かな進捗
    const kanaEl = document.getElementById("typing-kana-guide");
    kanaEl.innerHTML = `<span class="kana-done">${disp.doneKana}</span><span class="kana-current">${disp.currentKana}</span><span>${disp.upcomingKana}</span>`;

    // ローマ字ガイド表示（チャレンジモードかつミス0の間は未入力部分を隠す演出）
    const showGuide =
      this.storage.settings.romajiGuide &&
      (this.sessionStats.difficulty !== "challenge" || this.typingSession.missCount > 0);

    const romajiBox = document.getElementById("typing-romaji-box");
    if (this.typingSession.isCompleted()) {
      romajiBox.innerHTML = `<span class="romaji-typed">${disp.typedRomaji}</span> <span style="margin-left:10px; color:var(--accent-orange-dark); font-size:1.1rem;">✨クリア！（Enterで次へ）</span>`;
    } else if (showGuide) {
      romajiBox.innerHTML = `<span class="romaji-typed">${disp.typedRomaji}</span><span class="romaji-current ${missFlash ? "miss-flash" : ""}">${disp.currentChar}</span><span class="romaji-upcoming">${disp.upcomingRomaji}</span>`;
    } else {
      romajiBox.innerHTML = `<span class="romaji-typed">${disp.typedRomaji}</span><span class="romaji-current ${missFlash ? "miss-flash" : ""}">?</span><span class="romaji-upcoming" style="opacity:0.35;">・・・</span>`;
    }

    // 複数入力表記のヒント（shi / si など）
    const altHintEl = document.getElementById("typing-alt-hint");
    if (disp.altOptions && disp.altOptions.length > 1) {
      altHintEl.textContent = `💡 入力パターン: ${disp.altOptions.join(" / ")} のどれでもOK！`;
    } else {
      altHintEl.textContent = `💡 ${q ? q.explanation : ""}`;
    }

    // メトリクス更新
    const totalTyped = this.sessionStats.totalCorrectKeys + this.typingSession.correctKeyCount + this.sessionStats.totalMisses + this.typingSession.missCount;
    const totalOk = this.sessionStats.totalCorrectKeys + this.typingSession.correctKeyCount;
    const acc = totalTyped > 0 ? Math.round((totalOk / totalTyped) * 100) : 100;

    document.getElementById("typing-accuracy").textContent = `${acc}%`;
    document.getElementById("typing-combo").textContent = `${this.sessionStats.currentCombo}`;
    document.getElementById("typing-points").textContent = `${this.sessionStats.pointsEarned} pt`;
    document.getElementById("typing-combo-badge").textContent = `${this.sessionStats.currentCombo} COMBO!`;
  }

  handleTypingKeydown(e) {
    if (this.currentScreen !== "typing") return;
    // モーダルが開いている時は無視
    if (document.querySelector(".modal-backdrop.open")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Enter") {
      if (this.waitingNextEnter) {
        e.preventDefault();
        this.goToNextQuestion();
      }
      return;
    }

    if (this.waitingNextEnter || !this.typingSession) return;

    if (e.key.length === 1 && /^[a-zA-Z\-]$/.test(e.key)) {
      e.preventDefault();
      this.processTypingChar(e.key);
    }
  }

  processTypingChar(char) {
    if (!this.typingSession || this.waitingNextEnter) return;
    const res = this.typingSession.handleKey(char);

    if (res.status === "ok") {
      this.sessionStats.currentCombo += 1;
      this.sessionStats.maxCombo = Math.max(
        this.sessionStats.maxCombo,
        this.sessionStats.currentCombo
      );
      this.sound.playTypeOk(this.sessionStats.currentCombo);

      if (this.renderers.typing) {
        this.renderers.typing.triggerKeystrokeBoost(this.sessionStats.currentCombo);
      }

      if (this.sessionStats.currentCombo >= 10) {
        document.getElementById("typing-speech-bubble").textContent =
          `すごい！${this.sessionStats.currentCombo}連続正解！回し車がフルスピードだよ💨`;
      } else {
        document.getElementById("typing-speech-bubble").textContent =
          "いい調子！そのまま走り抜けよう🐿️";
      }

      this.updateTypingView(false);

      if (res.completedSentence) {
        this.onQuestionCompleted();
      }
    } else if (res.status === "miss") {
      this.sessionStats.currentCombo = 0;
      this.sound.playTypeMiss();
      if (this.renderers.typing) {
        this.renderers.typing.triggerMiss();
      }
      document.getElementById("typing-speech-bubble").textContent =
        `おっと！「${res.expectedChar.toUpperCase()}」をおしてみてね🌱（ポイントは減らないよ）`;
      this.updateTypingView(true);
    }
  }

  onQuestionCompleted() {
    this.waitingNextEnter = true;
    const q = this.activeQuestions[this.currentQIndex];
    const correctKeys = this.typingSession.correctKeyCount;
    const misses = this.typingSession.missCount;

    const reward = calculateQuestionReward({
      charCount: correctKeys,
      misses,
      maxCombo: this.typingSession.maxCombo,
      difficulty: this.sessionStats.difficulty,
      isReviewTarget: this.sessionStats.mode === "review",
    });

    this.sound.playQuestionClear(reward.isPerfect);
    if (this.renderers.typing) {
      this.renderers.typing.progressRatio = (this.currentQIndex + 1) / this.activeQuestions.length;
      this.renderers.typing.triggerSentenceComplete(reward.isPerfect);
    }

    // 1問ごとに localStorage へ即時保存 (仕様 7.2)
    const saveRes = this.storage.recordQuestionResult({
      kanjiId: q.kanjiId,
      readingType: q.readingType,
      correctKeys,
      misses,
      pointsEarned: reward.points,
      expEarned: reward.exp,
    });

    applyExpToCharacter(this.storage.character, reward.exp);
    this.storage.saveCharacter();
    this.updateHeaderUI();

    // セッション統計に加算
    this.sessionStats.clearedCount += 1;
    this.sessionStats.totalCorrectKeys += correctKeys;
    this.sessionStats.totalMisses += misses;
    this.sessionStats.pointsEarned += reward.points;
    this.sessionStats.expEarned += reward.exp;

    if (saveRes.newlyLearned && !this.sessionStats.newlyLearnedKanji.includes(q.kanji)) {
      this.sessionStats.newlyLearnedKanji.push(q.kanji);
    }
    if (misses > 0) {
      const already = this.sessionStats.reviewNeededQuestions.some((item) => item.uid === q.uid);
      if (!already) this.sessionStats.reviewNeededQuestions.push(q);
    }

    document.getElementById("typing-points").textContent = `${this.sessionStats.pointsEarned} pt`;
    document.getElementById("typing-speech-bubble").textContent = reward.isPerfect
      ? `🌟 ノーミスクリア！ +${reward.points}pt ゲット！ (Enterで次へ)`
      : `✨ クリア！ +${reward.points}pt ゲット！ (Enterで次へ)`;

    const nextBtn = document.getElementById("typing-next-btn");
    nextBtn.style.display = "inline-flex";
    nextBtn.textContent =
      this.currentQIndex + 1 < this.activeQuestions.length
        ? "つぎの問題へ (Enter) ➔"
        : "けっかを見る (Enter) 🎉";

    // 小学4年生がテンポよく進めるよう、1.1秒後に自動でも進める（Enterで即座に進むことも可能）
    this.autoNextTimer = setTimeout(() => {
      if (this.waitingNextEnter && this.currentScreen === "typing") {
        this.goToNextQuestion();
      }
    }, 1250);
  }

  goToNextQuestion() {
    if (this.autoNextTimer) {
      clearTimeout(this.autoNextTimer);
      this.autoNextTimer = null;
    }
    this.currentQIndex += 1;
    if (this.currentQIndex >= this.activeQuestions.length) {
      this.finishTypingSession();
    } else {
      this.loadCurrentQuestion();
    }
  }

  // 04. 結果画面
  finishTypingSession() {
    const st = this.sessionStats;
    const totalTyped = st.totalCorrectKeys + st.totalMisses;
    const accuracy = totalTyped > 0 ? Math.round((st.totalCorrectKeys / totalTyped) * 100) : 100;

    this.storage.recordSessionSummary({
      mode: st.mode,
      clearedCount: st.clearedCount,
      pointsEarned: st.pointsEarned,
      expEarned: st.expEarned,
      accuracy,
      maxCombo: st.maxCombo,
    });

    this.showScreen("result");
    if (this.renderers.result) {
      this.renderers.result.setState("happy", 5.0);
    }

    const leveledUp = this.storage.character.level > st.startLevel;
    if (leveledUp) {
      this.sound.playLevelUp();
    }

    document.getElementById("res-points").textContent = `+${st.pointsEarned} pt`;
    document.getElementById("res-exp").textContent = `+${st.expEarned} EXP`;
    document.getElementById("res-cleared").textContent = `${st.clearedCount} / ${st.totalQuestions} 問`;
    document.getElementById("res-accuracy").textContent = `${accuracy}%`;
    document.getElementById("res-combo").textContent = `${st.maxCombo} 回`;

    const lvBanner = document.getElementById("res-levelup-banner");
    if (leveledUp) {
      lvBanner.style.display = "block";
      lvBanner.textContent = `🎊 レベルアップ！ Lv.${st.startLevel} ➔ Lv.${this.storage.character.level} になったよ！`;
    } else {
      const req = getRequiredExpForLevel(this.storage.character.level);
      lvBanner.style.display = "block";
      lvBanner.textContent = `🐿️ 現在 Lv.${this.storage.character.level}（次のレベルまで あと ${req - this.storage.character.exp} EXP）`;
    }

    // 新しく学んだ漢字
    const newKanjiEl = document.getElementById("res-new-kanji");
    newKanjiEl.textContent =
      st.newlyLearnedKanji.length > 0 ? st.newlyLearnedKanji.join(" ・ ") : "なし（復習バッチリ！）";

    // 復習リスト
    const reviewListEl = document.getElementById("res-review-list");
    const reviewBtn = document.getElementById("res-review-btn");
    if (st.reviewNeededQuestions.length > 0) {
      reviewBtn.style.display = "inline-flex";
      reviewListEl.innerHTML = st.reviewNeededQuestions
        .map(
          (q) => `
          <div style="background:var(--bg-cream); border:2px solid var(--aux-beige); border-radius:12px; padding:10px 14px; margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <strong style="font-size:1.25rem; color:var(--accent-orange-dark);">【${q.kanji}】</strong>
              <span class="reading-type-badge ${q.readingType}">${q.readingLabel}：${q.yomi}</span>
              <div style="font-weight:800; margin-top:4px;">${q.sentenceHtml}（${q.kana}）</div>
            </div>
          </div>`
        )
        .join("");
    } else {
      reviewBtn.style.display = "none";
      reviewListEl.innerHTML = `<div style="color:var(--success-green); font-weight:800; padding:8px 0;">🌟 パーフェクト！間違えた問題はありませんでした！</div>`;
    }
  }

  // 05. 育成画面
  renderCareScreen() {
    const char = this.storage.character;
    const inv = this.storage.inventory;
    const player = this.storage.player;
    const reqExp = getRequiredExpForLevel(char.level);
    const expPct = Math.min(100, Math.round((char.exp / reqExp) * 100));

    document.getElementById("care-char-level").textContent = `Lv.${char.level} ${char.name}`;
    document.getElementById("care-exp-text").textContent = `${char.exp} / ${reqExp} EXP`;
    document.getElementById("care-exp-bar").style.width = `${expPct}%`;
    document.getElementById("care-mood-text").textContent = `ごきげん：${char.mood}% ♪`;
    document.getElementById("care-fed-count").textContent = `あげた木の実：${char.totalFed || 0}こ`;

    // 餌やりショップ描画
    const foodContainer = document.getElementById("care-food-list");
    foodContainer.innerHTML = SHOP_CATALOG.foods
      .map((f) => {
        const owned = inv.foods[f.id] || 0;
        const canBuy = player.currentPoints >= f.price;
        return `
        <div class="shop-item-card">
          <div class="shop-item-info">
            <span class="shop-item-icon">${f.icon}</span>
            <div>
              <div style="font-weight:900;">${f.name} <span style="font-size:0.8rem; color:var(--main-green-dark);">（所持:${owned}）</span></div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${f.desc} (+${f.exp}EXP)</div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; min-width:110px;">
            ${
              owned > 0
                ? `<button type="button" class="btn btn-green btn-sm feed-owned-btn" data-food-id="${f.id}">あげる(所持)</button>`
                : `<button type="button" class="btn btn-primary btn-sm buy-feed-btn" data-food-id="${f.id}" ${!canBuy ? "disabled" : ""}>${f.price}ptであげる</button>`
            }
          </div>
        </div>
      `;
      })
      .join("");

    foodContainer.querySelectorAll(".feed-owned-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.feedCharacter(btn.dataset.foodId, false));
    });
    foodContainer.querySelectorAll(".buy-feed-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.feedCharacter(btn.dataset.foodId, true));
    });

    // 着せ替え・回し車・お部屋カスタマイズ描画
    this.renderCustomizeSection();
  }

  feedCharacter(foodId, buyWithPoints) {
    const food = SHOP_CATALOG.foods.find((f) => f.id === foodId);
    if (!food) return;

    if (buyWithPoints) {
      if (this.storage.player.currentPoints < food.price) return;
      this.storage.player.currentPoints -= food.price;
      this.storage.savePlayer();
    } else {
      if ((this.storage.inventory.foods[foodId] || 0) <= 0) return;
      this.storage.inventory.foods[foodId] -= 1;
      this.storage.saveInventory();
    }

    this.storage.character.totalFed = (this.storage.character.totalFed || 0) + 1;
    this.storage.character.mood = Math.min(100, (this.storage.character.mood || 85) + food.mood);
    const lvRes = applyExpToCharacter(this.storage.character, food.exp);
    this.storage.saveCharacter();

    this.sound.playFeed();
    if (lvRes.leveledUp) {
      setTimeout(() => this.sound.playLevelUp(), 350);
    }

    if (this.renderers.care) {
      this.renderers.care.setState("eat", 2.4, { foodIcon: food.icon });
    }
    document.getElementById("care-speech-bubble").textContent = lvRes.leveledUp
      ? `🎉 もぐもぐ…おいしい！ Lv.${lvRes.newLevel} にレベルアップしたよ！`
      : `もぐもぐ…「${food.name}」とってもおいしいな！ありがとう${food.icon}`;

    this.updateHeaderUI();
    this.renderCareScreen();
  }

  renderCustomizeSection() {
    const char = this.storage.character;
    const inv = this.storage.inventory;
    const player = this.storage.player;

    // 帽子
    const hatEl = document.getElementById("care-hat-list");
    hatEl.innerHTML = SHOP_CATALOG.hats
      .map((h) => {
        const unlocked = inv.unlockedHats.includes(h.id);
        const equipped = char.equippedHat === h.id;
        return `
        <div class="shop-item-card">
          <div class="shop-item-info">
            <span class="shop-item-icon">${h.icon}</span>
            <div>
              <div style="font-weight:900;">${h.name}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${h.desc}</div>
            </div>
          </div>
          ${
            equipped
              ? `<span class="mastery-chip m-2">着用中</span>`
              : unlocked
              ? `<button type="button" class="btn btn-sub btn-sm equip-hat-btn" data-id="${h.id}">つける</button>`
              : `<button type="button" class="btn btn-primary btn-sm buy-hat-btn" data-id="${h.id}" ${player.currentPoints < h.price ? "disabled" : ""}>${h.price}pt</button>`
          }
        </div>
      `;
      })
      .join("");

    hatEl.querySelectorAll(".equip-hat-btn").forEach((b) =>
      b.addEventListener("click", () => {
        char.equippedHat = b.dataset.id;
        this.storage.saveCharacter();
        this.renderCareScreen();
      })
    );
    hatEl.querySelectorAll(".buy-hat-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const item = SHOP_CATALOG.hats.find((x) => x.id === b.dataset.id);
        if (!item || player.currentPoints < item.price) return;
        player.currentPoints -= item.price;
        inv.unlockedHats.push(item.id);
        char.equippedHat = item.id;
        this.storage.saveAll();
        this.sound.playQuestionClear(false);
        this.updateHeaderUI();
        this.renderCareScreen();
      })
    );

    // お部屋・回し車
    const roomEl = document.getElementById("care-room-list");
    const wheelHtml = SHOP_CATALOG.wheels
      .map((w) => {
        const unlocked = inv.unlockedWheels.includes(w.id);
        const equipped = char.equippedWheel === w.id;
        return `
        <div class="shop-item-card">
          <div class="shop-item-info">
            <span class="shop-item-icon">${w.icon}</span>
            <div>
              <div style="font-weight:900;">${w.name}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${w.desc}</div>
            </div>
          </div>
          ${
            equipped
              ? `<span class="mastery-chip m-2">使用中</span>`
              : unlocked
              ? `<button type="button" class="btn btn-sub btn-sm equip-wheel-btn" data-id="${w.id}">つかう</button>`
              : `<button type="button" class="btn btn-primary btn-sm buy-wheel-btn" data-id="${w.id}" ${player.currentPoints < w.price ? "disabled" : ""}>${w.price}pt</button>`
          }
        </div>`;
      })
      .join("");

    const roomItemsHtml = SHOP_CATALOG.roomItems
      .map((r) => {
        const unlocked = inv.unlockedRoom.includes(r.id);
        const equipped = char.equippedRoom.includes(r.id);
        return `
        <div class="shop-item-card">
          <div class="shop-item-info">
            <span class="shop-item-icon">${r.icon}</span>
            <div>
              <div style="font-weight:900;">${r.name}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">${r.desc}</div>
            </div>
          </div>
          ${
            unlocked
              ? `<button type="button" class="btn ${equipped ? "btn-green" : "btn-sub"} btn-sm toggle-room-btn" data-id="${r.id}">${equipped ? "配置中✓" : "かざる"}</button>`
              : `<button type="button" class="btn btn-primary btn-sm buy-room-btn" data-id="${r.id}" ${player.currentPoints < r.price ? "disabled" : ""}>${r.price}pt</button>`
          }
        </div>`;
      })
      .join("");

    roomEl.innerHTML = wheelHtml + roomItemsHtml;

    roomEl.querySelectorAll(".equip-wheel-btn").forEach((b) =>
      b.addEventListener("click", () => {
        char.equippedWheel = b.dataset.id;
        this.storage.saveCharacter();
        this.renderCareScreen();
      })
    );
    roomEl.querySelectorAll(".buy-wheel-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const item = SHOP_CATALOG.wheels.find((x) => x.id === b.dataset.id);
        if (!item || player.currentPoints < item.price) return;
        player.currentPoints -= item.price;
        inv.unlockedWheels.push(item.id);
        char.equippedWheel = item.id;
        this.storage.saveAll();
        this.sound.playQuestionClear(false);
        this.updateHeaderUI();
        this.renderCareScreen();
      })
    );
    roomEl.querySelectorAll(".toggle-room-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.id;
        if (char.equippedRoom.includes(id)) {
          char.equippedRoom = char.equippedRoom.filter((x) => x !== id);
        } else {
          char.equippedRoom.push(id);
        }
        this.storage.saveCharacter();
        this.renderCareScreen();
      })
    );
    roomEl.querySelectorAll(".buy-room-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const item = SHOP_CATALOG.roomItems.find((x) => x.id === b.dataset.id);
        if (!item || player.currentPoints < item.price) return;
        player.currentPoints -= item.price;
        inv.unlockedRoom.push(item.id);
        if (!char.equippedRoom.includes(item.id)) char.equippedRoom.push(item.id);
        this.storage.saveAll();
        this.sound.playQuestionClear(false);
        this.updateHeaderUI();
        this.renderCareScreen();
      })
    );
  }

  // 06. 漢字図鑑画面
  renderDictionaryScreen() {
    const gridEl = document.getElementById("dict-grid-container");
    const countEl = document.getElementById("dict-count-label");
    this.dictionary.renderGrid(gridEl, countEl);
  }

  // 07. 設定画面
  renderSettingsScreen() {
    const s = this.storage.settings;
    document.getElementById("set-bgm").checked = Boolean(s.bgm);
    document.getElementById("set-se").checked = Boolean(s.se);
    document.getElementById("set-speech").checked = Boolean(s.speech);
    document.getElementById("set-romaji").checked = Boolean(s.romajiGuide);
    document.getElementById("set-fontsize").value = s.fontSize || "normal";
    document.getElementById("set-default-count").value = String(s.defaultCount || 5);
    document.getElementById("set-char-name").value = this.storage.character.name || "もふまる";
  }

  bindEvents() {
    // ヘッダーナビゲーション
    document.getElementById("brand-home-btn").addEventListener("click", () => this.requestGoHome());
    document.getElementById("header-home-btn").addEventListener("click", () => this.requestGoHome());
    document.getElementById("header-settings-btn").addEventListener("click", () => {
      if (this.currentScreen === "typing" && !this.confirmLeaveTyping()) return;
      this.showScreen("settings");
    });

    // ホーム画面ボタン
    document.getElementById("home-start-btn").addEventListener("click", () => this.showScreen("mode"));
    document.getElementById("home-care-btn").addEventListener("click", () => this.showScreen("care"));
    document.getElementById("home-dict-btn").addEventListener("click", () => this.showScreen("dictionary"));
    document.getElementById("home-Quick5-btn").addEventListener("click", () => {
      this.startTypingSession({
        mode: "new",
        count: this.storage.settings.defaultCount || 5,
        readingFilter: "both",
        difficulty: "normal",
      });
    });

    // 学習モード選択画面
    document.querySelectorAll(".mode-option-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectedMode = card.dataset.mode;
        this.renderModeScreen();
      });
    });
    document.querySelectorAll("[data-count-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedCount = Number(btn.dataset.countChoice);
        this.renderModeScreen();
      });
    });
    document.querySelectorAll("[data-reading-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedReading = btn.dataset.readingChoice;
        this.renderModeScreen();
      });
    });
    document.querySelectorAll("[data-diff-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedDifficulty = btn.dataset.diffChoice;
        this.renderModeScreen();
      });
    });
    document.getElementById("mode-start-btn").addEventListener("click", () => {
      this.startTypingSession({
        mode: this.selectedMode,
        count: this.selectedCount,
        readingFilter: this.selectedReading,
        difficulty: this.selectedDifficulty,
      });
    });

    // タイピング画面操作
    window.addEventListener("keydown", (e) => this.handleTypingKeydown(e));

    document.getElementById("typing-retry-sentence-btn").addEventListener("click", (e) => {
      e.currentTarget.blur();
      if (this.typingSession && !this.waitingNextEnter) {
        this.typingSession.reset();
        this.updateTypingView(false);
        document.getElementById("typing-speech-bubble").textContent =
          "最初から入力をやり直すよ！落ち着いて打ってみよう🐿️";
      }
    });

    document.getElementById("typing-speak-btn").addEventListener("click", (e) => {
      e.currentTarget.blur();
      const q = this.activeQuestions[this.currentQIndex];
      if (q) speakText(`${q.kanji}。${q.sentence}`, true);
    });

    document.getElementById("typing-toggle-iframe-mode").addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.directIframeUrlMode = !this.directIframeUrlMode;
      e.currentTarget.textContent = this.directIframeUrlMode
        ? "🖼️ 画像フィット表示に戻す"
        : "🌐 URL直接iframe表示";
      const q = this.activeQuestions[this.currentQIndex];
      const iframeEl = document.getElementById("typing-image-iframe");
      updateIframeImage(iframeEl, q, this.directIframeUrlMode);
    });

    document.getElementById("typing-next-btn").addEventListener("click", () => {
      if (this.waitingNextEnter) this.goToNextQuestion();
    });

    // 結果画面ボタン
    document.getElementById("res-replay-btn").addEventListener("click", () => {
      if (this.lastSessionConfig) {
        this.startTypingSession(this.lastSessionConfig);
      } else {
        this.showScreen("mode");
      }
    });

    document.getElementById("res-review-btn").addEventListener("click", () => {
      if (this.sessionStats && this.sessionStats.reviewNeededQuestions.length > 0) {
        this.startTypingSession({
          mode: "review",
          count: this.sessionStats.reviewNeededQuestions.length,
          readingFilter: "both",
          difficulty: "normal",
          customQuestions: this.sessionStats.reviewNeededQuestions,
        });
      }
    });

    document.getElementById("res-home-btn").addEventListener("click", () => this.showScreen("home"));

    // 育成画面ポーズ切り替えボタン
    document.querySelectorAll("[data-care-pose]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pose = btn.dataset.carePose;
        if (this.renderers.care) {
          this.renderers.care.setState(pose, pose === "sleep" ? 15 : 3);
        }
      });
    });

    // 漢字図鑑フィルタ
    document.querySelectorAll("[data-dict-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-dict-filter]").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.dictionary.filterStatus = btn.dataset.dictFilter;
        this.renderDictionaryScreen();
      });
    });

    document.getElementById("dict-part-select").addEventListener("change", (e) => {
      this.dictionary.filterPart = e.target.value;
      this.renderDictionaryScreen();
    });

    document.getElementById("dict-search-input").addEventListener("input", (e) => {
      this.dictionary.searchQuery = e.target.value;
      this.renderDictionaryScreen();
    });

    // モーダル背景クリックで閉じる
    document.getElementById("kanji-detail-modal").addEventListener("click", (e) => {
      if (e.target.id === "kanji-detail-modal") {
        e.currentTarget.classList.remove("open");
      }
    });

    // 設定画面イベント
    const saveSet = () => {
      const s = this.storage.settings;
      s.bgm = document.getElementById("set-bgm").checked;
      s.se = document.getElementById("set-se").checked;
      s.speech = document.getElementById("set-speech").checked;
      s.romajiGuide = document.getElementById("set-romaji").checked;
      s.fontSize = document.getElementById("set-fontsize").value;
      s.defaultCount = Number(document.getElementById("set-default-count").value);
      this.selectedCount = s.defaultCount;
      this.storage.saveSettings();

      const newName = document.getElementById("set-char-name").value.trim();
      if (newName) {
        this.storage.character.name = newName;
        this.storage.saveCharacter();
      }
      this.applySettingsToDOM();
      this.updateHeaderUI();
    };

    ["set-bgm", "set-se", "set-speech", "set-romaji", "set-fontsize", "set-default-count", "set-char-name"].forEach(
      (id) => {
        document.getElementById(id).addEventListener("change", saveSet);
      }
    );

    // バックアップエクスポート
    document.getElementById("btn-export-json").addEventListener("click", () => {
      const jsonStr = this.storage.exportBackupJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mofu-typing-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // バックアップ復元
    const fileInput = document.getElementById("input-import-json");
    document.getElementById("btn-import-json").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm("現在のデータを上書きしてバックアップから復元しますか？")) {
        fileInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.storage.importBackupJSON(String(reader.result));
          this.applySettingsToDOM();
          this.updateHeaderUI();
          this.renderSettingsScreen();
          alert("データの復元が完了しました！🐿️");
        } catch (err) {
          alert("復元に失敗しました: " + err.message);
        }
        fileInput.value = "";
      };
      reader.readAsText(file);
    });

    // データ初期化
    document.getElementById("btn-reset-data").addEventListener("click", () => {
      if (
        confirm(
          "本当にすべての学習データ・ポイント・もふまるの成長記録を初期化しますか？\n（※初期化すると元に戻せません）"
        )
      ) {
        this.storage.resetAll();
        this.applySettingsToDOM();
        this.updateHeaderUI();
        this.showScreen("home");
      }
    });
  }

  confirmLeaveTyping() {
    return confirm(
      "タイピングの途中です。ホーム画面に戻りますか？\n（※クリア済みの問題のポイントや記録は保存されています）"
    );
  }

  requestGoHome() {
    if (this.currentScreen === "typing") {
      if (!this.confirmLeaveTyping()) return;
      if (this.autoNextTimer) clearTimeout(this.autoNextTimer);
    }
    this.showScreen("home");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new MofuTypingApp();
  app.init();
});
