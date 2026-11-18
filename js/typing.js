// ローマ字入力判定エンジン（複数表記・撥音「ん」・促音「っ」・拗音対応 / 仕様 4.3 準拠）

const BASE_ROMAJI_MAP = {
  あ: ["a"], い: ["i", "yi"], う: ["u", "wu", "whu"], え: ["e"], お: ["o"],
  か: ["ka", "ca"], き: ["ki"], く: ["ku", "cu", "qu"], け: ["ke"], こ: ["ko", "co"],
  さ: ["sa"], し: ["si", "shi", "ci"], す: ["su"], せ: ["se", "ce"], そ: ["so"],
  た: ["ta"], ち: ["ti", "chi"], つ: ["tu", "tsu"], て: ["te"], と: ["to"],
  な: ["na"], に: ["ni"], ぬ: ["nu"], ね: ["ne"], の: ["no"],
  は: ["ha"], ひ: ["hi"], ふ: ["hu", "fu"], へ: ["he"], ほ: ["ho"],
  ま: ["ma"], み: ["mi"], む: ["mu"], め: ["me"], も: ["mo"],
  や: ["ya"], ゆ: ["yu"], よ: ["yo"],
  ら: ["ra"], り: ["ri"], る: ["ru"], れ: ["re"], ろ: ["ro"],
  わ: ["wa"], を: ["wo"], ん: ["nn", "xn"],
  が: ["ga"], ぎ: ["gi"], ぐ: ["gu"], げ: ["ge"], ご: ["go"],
  ざ: ["za"], じ: ["zi", "ji"], ず: ["zu"], ぜ: ["ze"], ぞ: ["zo"],
  だ: ["da"], ぢ: ["di", "zi", "ji"], づ: ["du", "zu", "dzu"], で: ["de"], ど: ["do"],
  ば: ["ba"], び: ["bi"], ぶ: ["bu"], べ: ["be"], ぼ: ["bo"],
  ぱ: ["pa"], ぴ: ["pi"], ぷ: ["pu"], ぺ: ["pe"], ぽ: ["po"],
  きゃ: ["kya", "kixya", "kilya"], きゅ: ["kyu", "kixyu", "kilyu"], きょ: ["kyo", "kixyo", "kilyo"],
  しゃ: ["sya", "sha", "sixya", "shixya"], しゅ: ["syu", "shu", "sixyu", "shixyu"], しょ: ["syo", "sho", "sixyo", "shixyo"],
  ちゃ: ["tya", "cha", "cya", "tixya", "chixya"], ちゅ: ["tyu", "chu", "cyu", "tixyu", "chixyu"], ちょ: ["tyo", "cho", "cyo", "tixyo", "chixyo"],
  にゃ: ["nya", "nixya"], にゅ: ["nyu", "nixyu"], にょ: ["nyo", "nixyo"],
  ひゃ: ["hya", "hixya"], ひゅ: ["hyu", "hixyu"], ひょ: ["hyo", "hixyo"],
  みゃ: ["mya", "mixya"], みゅ: ["myu", "mixyu"], みょ: ["myo", "mixyo"],
  りゃ: ["rya", "rixya"], りゅ: ["ryu", "rixyu"], りょ: ["ryo", "rixyo"],
  ぎゃ: ["gya", "gixya"], ぎゅ: ["gyu", "gixyu"], ぎょ: ["gyo", "gixyo"],
  じゃ: ["zya", "ja", "jya", "zixya", "jixya"], じゅ: ["zyu", "ju", "jyu", "zixyu", "jixyu"], じょ: ["zyo", "jo", "jyo", "zixyo", "jixyo"],
  びゃ: ["bya", "bixya"], びゅ: ["byu", "bixyu"], びょ: ["byo", "bixyo"],
  ぴゃ: ["pya", "pixya"], ぴゅ: ["pyu", "pixyu"], ぴょ: ["pyo", "pixyo"],
  ゃ: ["xya", "lya"], ゅ: ["xyu", "lyu"], ょ: ["xyo", "lyo"],
  っ: ["xtu", "ltu", "xtsu", "ltsu"],
  ー: ["-"],
};

const SMALL_Y = new Set(["ゃ", "ゅ", "ょ"]);
const VOWEL_OR_Y_OR_N = new Set(["a", "i", "u", "e", "o", "y", "n"]);

function tokenizeKana(kanaStr) {
  const tokens = [];
  let i = 0;
  while (i < kanaStr.length) {
    const ch = kanaStr[i];
    const next = kanaStr[i + 1];
    if (next && SMALL_Y.has(next) && BASE_ROMAJI_MAP[ch + next]) {
      tokens.push(ch + next);
      i += 2;
    } else {
      tokens.push(ch);
      i += 1;
    }
  }
  return tokens;
}

class TypingSession {
  constructor(kanaString) {
    this.rawKana = kanaString.replace(/[。？、！\s]/g, "");
    this.tokens = tokenizeKana(this.rawKana);
    this.reset();
  }

  reset() {
    this.tokenIndex = 0;
    this.currentInput = "";
    this.typedHistory = "";
    this.correctKeyCount = 0;
    this.missCount = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.allowOptionalSecondN = false;
    this.allowOptionalXtuTail = null;
    this.forcedNextStartChar = null;

    this.tokenOptions = this.tokens.map((tok, idx) => this.computeOptionsForToken(idx));
  }

  computeOptionsForToken(idx) {
    const tok = this.tokens[idx];
    const nextTok = this.tokens[idx + 1];

    if (tok === "ん") {
      if (!nextTok) {
        return ["nn", "xn"];
      }
      const nextBase = BASE_ROMAJI_MAP[nextTok] || [nextTok];
      const canSingleN = nextBase.some((opt) => !VOWEL_OR_Y_OR_N.has(opt[0]));
      if (canSingleN) {
        return ["n", "nn", "xn"];
      }
      return ["nn", "xn"];
    }

    if (tok === "っ") {
      const sokuonOpts = [];
      if (nextTok && BASE_ROMAJI_MAP[nextTok]) {
        const nextBase = BASE_ROMAJI_MAP[nextTok];
        for (const opt of nextBase) {
          const c = opt[0];
          if (!VOWEL_OR_Y_OR_N.has(c) && !sokuonOpts.includes(c)) {
            sokuonOpts.push(c);
          }
        }
      }
      for (const fallback of ["xtu", "ltu", "xtsu", "ltsu"]) {
        if (!sokuonOpts.includes(fallback)) sokuonOpts.push(fallback);
      }
      return sokuonOpts;
    }

    return [...(BASE_ROMAJI_MAP[tok] || [tok])];
  }

  isCompleted() {
    return this.tokenIndex >= this.tokens.length;
  }

  getActiveCandidates() {
    if (this.isCompleted()) return [];
    let opts = this.tokenOptions[this.tokenIndex] || [];
    if (this.forcedNextStartChar) {
      const filtered = opts.filter((o) => o.startsWith(this.forcedNextStartChar));
      if (filtered.length > 0) opts = filtered;
    }
    if (!this.currentInput) return opts;
    return opts.filter((o) => o.startsWith(this.currentInput));
  }

  handleKey(rawKey) {
    if (this.isCompleted()) {
      return { status: "already_completed" };
    }

    const key = String(rawKey).toLowerCase();
    if (key.length !== 1 || !/^[a-z\-]$/.test(key)) {
      return { status: "ignored" };
    }

    // 直前の「ん」を単一 'n' で通過した直後に 2つ目の 'n' が打たれた場合を許容
    if (this.allowOptionalSecondN && this.currentInput === "" && key === "n") {
      const activeOpts = this.getActiveCandidates();
      const nextStartsWithN = activeOpts.some((o) => o.startsWith("n"));
      if (!nextStartsWithN) {
        this.allowOptionalSecondN = false;
        this.typedHistory += "n";
        this.correctKeyCount += 1;
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        return {
          status: "ok",
          completedSentence: false,
          combo: this.combo,
        };
      }
    }
    this.allowOptionalSecondN = false;

    const nextInput = this.currentInput + key;
    const candidates = this.getActiveCandidates().filter((o) => o.startsWith(nextInput));

    if (candidates.length === 0) {
      this.missCount += 1;
      this.combo = 0;
      return {
        status: "miss",
        expectedChar: this.getNextExpectedChar(),
        combo: 0,
      };
    }

    // 正解キー
    this.currentInput = nextInput;
    this.typedHistory += key;
    this.correctKeyCount += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const currentToken = this.tokens[this.tokenIndex];

    // 完全一致した候補があるか確認
    const exactMatch = candidates.includes(this.currentInput);
    if (exactMatch) {
      // 「ん」で 'n' 1文字入力の場合、次のトークンが n 始まりでなければ即座に次へ進み、追加の 'n' も許容
      if (currentToken === "ん" && this.currentInput === "n") {
        this.allowOptionalSecondN = true;
        this.advanceToken(null);
      } else if (
        currentToken === "っ" &&
        this.currentInput.length === 1 &&
        !["x", "l"].includes(this.currentInput)
      ) {
        // 促音の子音重ね入力（例: k, s, t, p, c）の場合、次のトークンの先頭文字を同じ子音に揃える
        const usedConsonant = this.currentInput;
        this.advanceToken(usedConsonant);
      } else {
        this.advanceToken(null);
      }
    }

    return {
      status: "ok",
      completedSentence: this.isCompleted(),
      combo: this.combo,
    };
  }

  advanceToken(forceStartChar = null) {
    this.tokenIndex += 1;
    this.currentInput = "";
    this.forcedNextStartChar = forceStartChar;
  }

  getNextExpectedChar() {
    if (this.isCompleted()) return "";
    const cands = this.getActiveCandidates();
    if (cands.length === 0) return "";
    return cands[0][this.currentInput.length] || "";
  }

  getDisplayState() {
    if (this.isCompleted()) {
      return {
        typedRomaji: this.typedHistory,
        currentChar: "",
        upcomingRomaji: "",
        doneKana: this.tokens.join(""),
        currentKana: "",
        upcomingKana: "",
        altOptions: [],
      };
    }

    const activeCands = this.getActiveCandidates();
    const primaryActive = activeCands[0] || "";
    const remainingCurrentToken = primaryActive.slice(this.currentInput.length);
    const currentChar = remainingCurrentToken[0] || "";
    let upcomingRomaji = remainingCurrentToken.slice(1);

    for (let i = this.tokenIndex + 1; i < this.tokens.length; i++) {
      const tok = this.tokens[i];
      const opts = this.tokenOptions[i] || [];
      if (tok === "っ" && this.tokens[i + 1]) {
        const nextOpts = this.tokenOptions[i + 1] || [""];
        upcomingRomaji += nextOpts[0] ? nextOpts[0][0] : opts[0] || "";
      } else {
        upcomingRomaji += opts[0] || "";
      }
    }

    const doneKana = this.tokens.slice(0, this.tokenIndex).join("");
    const currentKana = this.tokens[this.tokenIndex] || "";
    const upcomingKana = this.tokens.slice(this.tokenIndex + 1).join("");

    // 複数入力候補のヒント（例: shi / si）
    const altOptions = activeCands.slice(0, 3);

    return {
      typedRomaji: this.typedHistory,
      currentChar,
      upcomingRomaji,
      doneKana,
      currentKana,
      upcomingKana,
      altOptions,
    };
  }
}
