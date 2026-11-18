// 漢字図鑑＆iframeイメージ画像埋め込みモジュール (仕様 4.3 / 4.6 / 9章準拠)
function buildImageIframeSrcdoc({ kanji, readingLabel, yomi, sentence, imageUrl }) {
  const safeSentence = (sentence || "").replace(/"/g, "&quot;");
  const safeKanji = (kanji || "").replace(/"/g, "&quot;");
  const safeYomi = (yomi || "").replace(/"/g, "&quot;");
  const safeLabel = (readingLabel || "").replace(/"/g, "&quot;");
  const hasUrl = Boolean(imageUrl && imageUrl.startsWith("http"));

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="referrer" content="no-referrer">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #FFF9F0;
    font-family: "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .img-wrap {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  img.main-photo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #FFF9F0;
    display: block;
  }
  .fallback-card {
    display: ${hasUrl ? "none" : "flex"};
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    width: 100%;
    height: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #F8F3E8 0%, #E5F2E5 100%);
    color: #4E3828;
  }
  .fallback-kanji {
    font-size: 46px;
    font-weight: 900;
    color: #6B9B71;
    line-height: 1.1;
    margin-bottom: 4px;
  }
  .fallback-sub {
    font-size: 13px;
    font-weight: 700;
    color: #795B45;
  }
</style>
</head>
<body>
  <div class="img-wrap">
    ${
      hasUrl
        ? `<img class="main-photo" src="${imageUrl}" alt="${safeSentence}" referrerpolicy="no-referrer"
             onerror="this.style.display='none'; document.getElementById('fb').style.display='flex';" />`
        : ""
    }
    <div id="fb" class="fallback-card">
      <div class="fallback-kanji">🐿️ ${safeKanji}</div>
      <div class="fallback-sub">${safeLabel}（${safeYomi}）：${safeSentence}</div>
    </div>
  </div>
</body>
</html>`;
}

function updateIframeImage(iframeEl, itemData, directUrlMode = false) {
  if (!iframeEl || !itemData) return;
  const imageUrl = itemData.imageUrl || "";
  iframeEl.setAttribute("data-image-url", imageUrl);

  if (directUrlMode && imageUrl) {
    iframeEl.removeAttribute("srcdoc");
    iframeEl.src = imageUrl;
  } else {
    if (imageUrl) {
      iframeEl.setAttribute("src", imageUrl);
    } else {
      iframeEl.removeAttribute("src");
    }
    iframeEl.srcdoc = buildImageIframeSrcdoc({
      kanji: itemData.kanji,
      readingLabel: itemData.readingLabel,
      yomi: itemData.yomi,
      sentence: itemData.sentence,
      imageUrl,
    });
  }
}

function masteryLabel(m) {
  if (m === null || m === undefined) return "—";
  if (m >= 2) return "★習得済";
  if (m === 1) return "●学習中";
  return "未学習";
}

class DictionaryController {
  constructor({ kanjiList, storage, onStartPractice }) {
    this.kanjiList = kanjiList;
    this.storage = storage;
    this.onStartPractice = onStartPractice;

    this.filterStatus = "all"; // all | unlearned | learning | mastered | weak
    this.filterPart = "all"; // all | 1..6
    this.searchQuery = "";
  }

  getPartNumber(index) {
    if (index <= 20) return "1";
    if (index <= 40) return "2";
    if (index <= 60) return "3";
    if (index <= 96) return "4";
    if (index <= 138) return "5";
    return "6";
  }

  getFilteredList() {
    const q = this.searchQuery.trim().toLowerCase();
    return this.kanjiList.filter((item) => {
      if (this.filterPart !== "all" && this.getPartNumber(item.index) !== this.filterPart) {
        return false;
      }
      const st = getKanjiMasteryStatus(item, this.storage);
      if (this.filterStatus === "unlearned" && st.overallStatus !== "unlearned") return false;
      if (this.filterStatus === "learning" && st.overallStatus !== "learning") return false;
      if (this.filterStatus === "mastered" && st.overallStatus !== "mastered") return false;
      if (this.filterStatus === "weak" && !st.isWeak) return false;

      if (q) {
        const hay = [
          item.kanji,
          item.on ? item.on.yomi : "",
          item.on ? item.on.sentence : "",
          item.on ? item.on.kana : "",
          item.kun ? item.kun.yomi : "",
          item.kun ? item.kun.sentence : "",
          item.kun ? item.kun.kana : "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  renderGrid(containerEl, countLabelEl) {
    if (!containerEl) return;
    const list = this.getFilteredList();
    if (countLabelEl) {
      countLabelEl.textContent = `${list.length} / ${this.kanjiList.length} 漢字`;
    }

    if (list.length === 0) {
      containerEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 36px; color: var(--text-muted); font-weight: 800;">
          🐿️ 条件に合う漢字が見つかりませんでした。
        </div>`;
      return;
    }

    containerEl.innerHTML = list
      .map((item) => {
        const st = getKanjiMasteryStatus(item, this.storage);
        const onText = item.on ? item.on.yomi : "—";
        const kunText = item.kun ? item.kun.yomi : "—";
        const onClass = item.on ? `m-${st.onMastery}` : "m-0";
        const kunClass = item.kun ? `m-${st.kunMastery}` : "m-0";

        return `
          <button type="button" class="dict-kanji-card" data-kanji-id="${item.id}">
            <div style="display:flex; justify-content:space-between; width:100%; font-size:0.72rem; color:var(--text-muted); font-weight:800;">
              <span>No.${item.index}</span>
              <span>${st.isWeak ? "💦苦手" : st.overallStatus === "mastered" ? "👑習得" : ""}</span>
            </div>
            <div class="dict-kanji-char">${item.kanji}</div>
            <div style="font-size:0.78rem; color:var(--text-brown); font-weight:700; text-align:center; line-height:1.3;">
              <div>音: ${onText}</div>
              <div>訓: ${kunText}</div>
            </div>
            <div class="dict-mastery-row">
              ${
                item.on
                  ? `<span class="mastery-chip ${onClass}">音:${masteryLabel(st.onMastery)}</span>`
                  : `<span class="mastery-chip m-0">音:なし</span>`
              }
              ${
                item.kun
                  ? `<span class="mastery-chip ${kunClass}">訓:${masteryLabel(st.kunMastery)}</span>`
                  : `<span class="mastery-chip m-0">訓:なし</span>`
              }
            </div>
          </button>
        `;
      })
      .join("");

    containerEl.querySelectorAll(".dict-kanji-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-kanji-id");
        const found = this.kanjiList.find((k) => k.id === id);
        if (found) this.openDetailModal(found);
      });
    });
  }

  openDetailModal(kanjiItem) {
    const modal = document.getElementById("kanji-detail-modal");
    const body = document.getElementById("kanji-detail-body");
    if (!modal || !body) return;

    const st = getKanjiMasteryStatus(kanjiItem, this.storage);

    const renderReadingPanel = (entry, rType, rec) => {
      const label = rType === "on" ? "音読み" : "訓読み";
      const badgeClass = rType === "on" ? "on" : "kun";
      if (!entry) {
        return `
          <div class="mofu-card" style="background:var(--bg-cream); opacity:0.75;">
            <span class="reading-type-badge ${badgeClass}">${label}</span>
            <p style="margin-top:12px; font-weight:800; color:var(--text-muted);">一般的な${label}はありません</p>
          </div>
        `;
      }

      const acc =
        rec && rec.correctKeys + rec.misses > 0
          ? `${Math.round((rec.correctKeys / (rec.correctKeys + rec.misses)) * 100)}%`
          : "未挑戦";

      return `
        <div class="mofu-card" style="background:var(--bg-cream); display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="reading-type-badge ${badgeClass}">${label}：${entry.yomi}</span>
            <span class="mastery-chip m-${rec ? rec.mastery : 0}">${masteryLabel(rec ? rec.mastery : 0)}（正答率: ${acc}）</span>
          </div>
          <div style="font-size:1.18rem; font-weight:900; color:var(--text-brown-dark);">
            ${entry.sentenceHtml}
          </div>
          <div style="font-size:0.88rem; color:var(--text-muted); font-weight:700;">
            よみ：${entry.kana}
          </div>
          <div class="iframe-wrapper" style="height:165px;">
            <iframe class="example-image-iframe detail-iframe-${rType}" title="${kanjiItem.kanji} ${label}イメージ" referrerpolicy="no-referrer"></iframe>
          </div>
          <div style="font-size:0.82rem; color:var(--text-brown); background:#fff; padding:8px 12px; border-radius:10px; border:1px solid var(--aux-beige);">
            💡 ${entry.explanation}
            ${
              entry.sourceUrl
                ? `<div style="margin-top:4px; font-size:0.75rem;"><a href="${entry.sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--main-green-dark);">🔗 画像取得元ページを開く</a></div>`
                : ""
            }
          </div>
          <button type="button" class="btn btn-green btn-sm start-single-reading-btn" data-rtype="${rType}">
            ⌨️ この${label}をタイピング練習する
          </button>
        </div>
      `;
    };

    body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="font-size:4.2rem; font-weight:900; background:var(--bg-cream); border:3px solid var(--aux-beige); border-radius:20px; width:96px; height:96px; display:flex; align-items:center; justify-content:center;">
            ${kanjiItem.kanji}
          </div>
          <div>
            <div style="font-size:0.85rem; color:var(--text-muted); font-weight:800;">小学4年生の漢字 No.${kanjiItem.index}</div>
            <h3 style="font-size:1.5rem; font-weight:900;">「${kanjiItem.kanji}」の音読み・訓読みと例文</h3>
            <div style="font-size:0.9rem; color:var(--text-brown); font-weight:700; margin-top:4px;">
              挑戦回数: ${st.totalAttempts}回 / 正答率: ${st.accuracy !== null ? st.accuracy + "%" : "未挑戦"}
            </div>
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn btn-primary" id="modal-practice-both-btn">🚀 この漢字に再挑戦！</button>
          <button type="button" class="btn btn-sub" id="modal-close-btn">とじる</button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
        ${renderReadingPanel(kanjiItem.on, "on", st.onRec)}
        ${renderReadingPanel(kanjiItem.kun, "kun", st.kunRec)}
      </div>
    `;

    // iframe 画像をセット
    if (kanjiItem.on) {
      const onIframe = body.querySelector(".detail-iframe-on");
      updateIframeImage(onIframe, {
        kanji: kanjiItem.kanji,
        readingLabel: "音読み",
        ...kanjiItem.on,
      });
    }
    if (kanjiItem.kun) {
      const kunIframe = body.querySelector(".detail-iframe-kun");
      updateIframeImage(kunIframe, {
        kanji: kanjiItem.kanji,
        readingLabel: "訓読み",
        ...kanjiItem.kun,
      });
    }

    body.querySelector("#modal-close-btn").addEventListener("click", () => {
      modal.classList.remove("open");
    });

    body.querySelector("#modal-practice-both-btn").addEventListener("click", () => {
      modal.classList.remove("open");
      const customQs = [];
      if (kanjiItem.on) {
        customQs.push({
          uid: `${kanjiItem.id}_on`,
          kanjiId: kanjiItem.id,
          index: kanjiItem.index,
          kanji: kanjiItem.kanji,
          readingType: "on",
          readingLabel: "音読み",
          ...kanjiItem.on,
        });
      }
      if (kanjiItem.kun) {
        customQs.push({
          uid: `${kanjiItem.id}_kun`,
          kanjiId: kanjiItem.id,
          index: kanjiItem.index,
          kanji: kanjiItem.kanji,
          readingType: "kun",
          readingLabel: "訓読み",
          ...kanjiItem.kun,
        });
      }
      if (this.onStartPractice && customQs.length > 0) {
        this.onStartPractice(customQs);
      }
    });

    body.querySelectorAll(".start-single-reading-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rType = btn.getAttribute("data-rtype");
        const entry = kanjiItem[rType];
        if (!entry) return;
        modal.classList.remove("open");
        if (this.onStartPractice) {
          this.onStartPractice([
            {
              uid: `${kanjiItem.id}_${rType}`,
              kanjiId: kanjiItem.id,
              index: kanjiItem.index,
              kanji: kanjiItem.kanji,
              readingType: rType,
              readingLabel: rType === "on" ? "音読み" : "訓読み",
              ...entry,
            },
          ]);
        }
      });
    });

    modal.classList.add("open");
  }
}
