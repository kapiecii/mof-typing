// HTML5 Canvas エゾリス＆回し車・森のお部屋アニメーションエンジン (仕様 8章準拠)

const SHOP_CATALOG = {
  foods: [
    { id: "acorn", name: "どんぐり", price: 10, icon: "🌰", exp: 10, mood: 8, desc: "森でひろったツヤツヤのどんぐり" },
    { id: "walnut", name: "くるみ", price: 30, icon: "🥜", exp: 28, mood: 15, desc: "カリッとおいしい栄養満点くるみ" },
    { id: "nutset", name: "木の実セット", price: 50, icon: "🧺", exp: 50, mood: 25, desc: "いろんな木の実がつまったごちそう" },
    { id: "berry", name: "森のベリー", price: 80, icon: "🫐", exp: 85, mood: 35, desc: "あまずっぱい特別なデザート！" },
  ],
  hats: [
    { id: "none", name: "なし", price: 0, icon: "🐿️", desc: "そのままの耳毛がチャームポイント" },
    { id: "leaf", name: "若葉のぼうし", price: 60, icon: "🍃", desc: "森の若葉で作ったかわいい帽子" },
    { id: "flower", name: "花かんむり", price: 120, icon: "🌼", desc: "白いお花を編んだかんむり" },
    { id: "ribbon", name: "赤いリボン", price: 150, icon: "🎀", desc: "お出かけ用の素敵なリボン" },
    { id: "crown", name: "どんぐり王冠", price: 250, icon: "👑", desc: "漢字マスターの証！キラキラ王冠" },
  ],
  wheels: [
    { id: "wood", name: "木の回し車", price: 0, icon: "🪵", desc: "ぬくもりのある手作りの回し車" },
    { id: "leaf_wheel", name: "若葉の回し車", price: 100, icon: "🌿", desc: "緑のツルが巻かれた爽やかな回し車" },
    { id: "star_wheel", name: "星屑の回し車", price: 220, icon: "⭐", desc: "走るとキラキラ輝く特別な回し車" },
  ],
  roomItems: [
    { id: "window", name: "森の小窓", price: 0, icon: "🪟", desc: "外の森が見える明るい窓" },
    { id: "sprout", name: "若葉の鉢植え", price: 0, icon: "🌱", desc: "お部屋の小さな観葉植物" },
    { id: "cushion", name: "ふかふかクッション", price: 90, icon: "🛋️", desc: "お昼寝にぴったりの切り株クッション" },
    { id: "shelf", name: "木の実の棚", price: 140, icon: "🗄️", desc: "集めた木の実をかざる宝物棚" },
    { id: "garland", name: "森のガーランド", price: 180, icon: "🎏", desc: "お部屋が楽しくなる旗かざり" },
  ],
};

class MofuCanvasRenderer {
  constructor(canvas, characterStateGetter) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.getCharState = characterStateGetter;

    // 必須アニメーション状態: idle | run | fast_run | eat | happy | sleep (+ miss)
    this.state = "idle";
    this.stateTimer = 0;
    this.wheelAngle = 0;
    this.wheelVelocity = 0;
    this.targetWheelVelocity = 0;
    this.combo = 0;
    this.eatingFoodIcon = "🌰";
    this.particles = [];
    this.progressRatio = 0; // タイピング画面での進捗表示用 (0..1)
    this.showProgressTrack = false;
    this.lastTime = performance.now();
    this.animFrameId = null;

    this.setupInteraction();
    this.startLoop();
  }

  setupInteraction() {
    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      this.spawnParticles(x, y, "heart", 6);
      if (this.state === "idle" || this.state === "sleep") {
        this.setState("happy", 1.4);
      }
    });
  }

  setState(newState, durationSec = 0, extra = {}) {
    this.state = newState;
    this.stateTimer = durationSec;
    if (extra.foodIcon) {
      this.eatingFoodIcon = extra.foodIcon;
    }
    if (newState === "happy") {
      this.spawnParticles(this.canvas.width * 0.52, this.canvas.height * 0.55, "star", 14);
    } else if (newState === "eat") {
      this.spawnParticles(this.canvas.width * 0.5, this.canvas.height * 0.5, "heart", 8);
    }
  }

  triggerKeystrokeBoost(combo = 1) {
    this.combo = combo;
    if (combo >= 10) {
      this.state = "fast_run";
      this.targetWheelVelocity = Math.min(14, 6.5 + combo * 0.22);
      if (combo % 5 === 0) {
        this.spawnParticles(this.canvas.width * 0.52, this.canvas.height * 0.52, "leaf", 5);
      }
    } else {
      this.state = "run";
      this.targetWheelVelocity = Math.min(8, 3.8 + combo * 0.25);
    }
    this.wheelVelocity = Math.max(this.wheelVelocity, this.targetWheelVelocity);
    this.stateTimer = 1.6; // 1.6秒間入力が止まったらゆっくり待機へ戻る
  }

  triggerMiss() {
    this.combo = 0;
    this.state = "miss";
    this.stateTimer = 0.65;
    this.targetWheelVelocity = 0.4;
  }

  triggerSentenceComplete(isPerfect = false) {
    this.state = "happy";
    this.stateTimer = 2.2;
    this.targetWheelVelocity = 0;
    this.spawnParticles(
      this.canvas.width * 0.52,
      this.canvas.height * 0.48,
      isPerfect ? "rainbow" : "star",
      isPerfect ? 24 : 14
    );
  }

  spawnParticles(x, y, type = "star", count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 1.0,
        decay: 0.7 + Math.random() * 0.5,
        type,
        size: 8 + Math.random() * 8,
        hue: Math.floor(Math.random() * 360),
      });
    }
  }

  startLoop() {
    const tick = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt, now / 1000);
      this.draw(now / 1000);
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  update(dt, t) {
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.state === "run" || this.state === "fast_run" || this.state === "miss" || this.state === "eat" || this.state === "happy") {
          this.state = "idle";
          this.targetWheelVelocity = 0;
        }
      }
    }

    if (this.state === "idle" || this.state === "sleep" || this.state === "eat") {
      this.targetWheelVelocity = 0;
    }

    // 滑らかに回し車の回転速度を補間
    this.wheelVelocity += (this.targetWheelVelocity - this.wheelVelocity) * Math.min(1, dt * 6);
    this.wheelAngle += this.wheelVelocity * dt;

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt; // 軽い重力
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(t) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const charData = this.getCharState ? this.getCharState() : {};
    const roomItems = charData.equippedRoom || ["window", "sprout"];
    const wheelStyle = charData.equippedWheel || "wood";
    const hatStyle = charData.equippedHat || "none";

    ctx.clearRect(0, 0, W, H);

    // 1. 森のお部屋背景（壁紙・木の床・巾木）
    this.drawRoomBackground(ctx, W, H, roomItems, t);

    // 2. 集中線（fast_run時）
    if (this.state === "fast_run") {
      this.drawSpeedLines(ctx, W, H, t);
    }

    // 3. 回し車（背面）
    const wheelCx = W * 0.56;
    const wheelCy = H * 0.52;
    const wheelR = Math.min(W, H) * 0.31;
    this.drawRunningWheel(ctx, wheelCx, wheelCy, wheelR, wheelStyle);

    // 4. エゾリス（もふまる）の描画
    const isOnWheel = this.state === "run" || this.state === "fast_run" || this.state === "miss";
    const squirrelX = isOnWheel ? wheelCx - 4 : W * 0.42;
    const squirrelY = isOnWheel ? wheelCy + wheelR * 0.48 : H * 0.69;
    this.drawEzorisu(ctx, squirrelX, squirrelY, t, hatStyle);

    // 5. 回し車の前面フレーム
    this.drawWheelFrontHub(ctx, wheelCx, wheelCy, wheelR, wheelStyle);

    // 6. タイピング画面用：下部のどんぐり進捗トラック
    if (this.showProgressTrack) {
      this.drawProgressTrack(ctx, W, H);
    }

    // 7. パーティクル描画
    this.drawParticles(ctx);
  }

  drawRoomBackground(ctx, W, H, roomItems, t) {
    // 壁
    const wallGrad = ctx.createLinearGradient(0, 0, 0, H * 0.74);
    wallGrad.addColorStop(0, "#F6F1E3");
    wallGrad.addColorStop(1, "#EDE2CC");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, W, H * 0.74);

    // 木の床
    const floorGrad = ctx.createLinearGradient(0, H * 0.74, 0, H);
    floorGrad.addColorStop(0, "#D9B384");
    floorGrad.addColorStop(1, "#C49A68");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, H * 0.74, W, H * 0.26);

    // 床の板目ライン
    ctx.strokeStyle = "rgba(121, 91, 69, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.74);
    ctx.lineTo(W, H * 0.74);
    ctx.moveTo(0, H * 0.85);
    ctx.lineTo(W, H * 0.85);
    ctx.stroke();

    // 森の小窓
    if (roomItems.includes("window")) {
      const wx = W * 0.08;
      const wy = H * 0.14;
      const ww = 96;
      const wh = 105;

      ctx.save();
      ctx.fillStyle = "#CBE8DF";
      ctx.beginPath();
      ctx.roundRect(wx, wy, ww, wh, [48, 48, 8, 8]);
      ctx.fill();

      // 窓の外の森の木々
      ctx.fillStyle = "#85B88B";
      ctx.beginPath();
      ctx.arc(wx + 26, wy + 80, 28, 0, Math.PI * 2);
      ctx.arc(wx + 72, wy + 85, 32, 0, Math.PI * 2);
      ctx.fill();

      // 窓枠
      ctx.strokeStyle = "#8C6239";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(wx, wy, ww, wh, [48, 48, 8, 8]);
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh * 0.55);
      ctx.lineTo(wx + ww, wy + wh * 0.55);
      ctx.stroke();
      ctx.restore();
    }

    // ガーランド（旗かざり）
    if (roomItems.includes("garland")) {
      ctx.save();
      ctx.strokeStyle = "#8C6239";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 22);
      ctx.quadraticCurveTo(W * 0.5, 58, W - 20, 22);
      ctx.stroke();

      const colors = ["#D99A57", "#6B9B71", "#E8B86B", "#A7C69B", "#E06D53", "#6B9B71"];
      for (let i = 0; i < 6; i++) {
        const ratio = (i + 0.5) / 6;
        const fx = 20 + (W - 40) * ratio;
        const fy = 22 + Math.sin(ratio * Math.PI) * 18;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(fx - 12, fy);
        ctx.lineTo(fx + 12, fy);
        ctx.lineTo(fx, fy + 20);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 木の実の棚
    if (roomItems.includes("shelf")) {
      const sx = W * 0.78;
      const sy = H * 0.22;
      ctx.save();
      ctx.fillStyle = "#9C6E44";
      ctx.fillRect(sx, sy + 26, 86, 8);
      ctx.font = "20px sans-serif";
      ctx.fillText("🌰", sx + 8, sy + 22);
      ctx.fillText("🥜", sx + 34, sy + 22);
      ctx.fillText("🫐", sx + 58, sy + 22);
      ctx.restore();
    }

    // 若葉の鉢植え
    if (roomItems.includes("sprout")) {
      const px = W * 0.14;
      const py = H * 0.74;
      ctx.save();
      // 植木鉢
      ctx.fillStyle = "#C87A51";
      ctx.beginPath();
      ctx.moveTo(px - 18, py - 28);
      ctx.lineTo(px + 18, py - 28);
      ctx.lineTo(px + 13, py);
      ctx.lineTo(px - 13, py);
      ctx.closePath();
      ctx.fill();

      // 双葉
      const sway = Math.sin(t * 2) * 3;
      ctx.strokeStyle = "#5B8E61";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py - 28);
      ctx.quadraticCurveTo(px + sway, py - 42, px + sway, py - 48);
      ctx.stroke();

      ctx.fillStyle = "#7BB67F";
      ctx.beginPath();
      ctx.ellipse(px - 9 + sway, py - 48, 10, 5, -0.4, 0, Math.PI * 2);
      ctx.ellipse(px + 9 + sway, py - 48, 10, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ふかふかクッション
    if (roomItems.includes("cushion")) {
      const cx = W * 0.27;
      const cy = H * 0.78;
      ctx.save();
      ctx.fillStyle = "#E59866";
      ctx.strokeStyle = "#A96338";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 38, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawSpeedLines(ctx, W, H, t) {
    ctx.save();
    ctx.strokeStyle = "rgba(217, 154, 87, 0.28)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const y = ((i * 47 + t * 240) % (H * 0.7)) + 20;
      const x = ((i * 97 - t * 520) % W + W) % W;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 48, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRunningWheel(ctx, cx, cy, r, style) {
    ctx.save();

    // 土台スタンド
    ctx.strokeStyle = "#795B45";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy + r + 18);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + r * 0.55, cy + r + 18);
    ctx.moveTo(cx - r * 0.72, cy + r + 18);
    ctx.lineTo(cx + r * 0.72, cy + r + 18);
    ctx.stroke();

    // ホイール背面サークル
    ctx.fillStyle = style === "star_wheel" ? "rgba(255, 246, 214, 0.55)" : "rgba(242, 226, 198, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 回転するスポーク
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.wheelAngle);

    const spokeColor =
      style === "leaf_wheel" ? "#5F9465" : style === "star_wheel" ? "#D99A57" : "#A67C52";
    ctx.strokeStyle = spokeColor;
    ctx.lineWidth = 4;
    const spokeCount = 8;
    for (let i = 0; i < spokeCount; i++) {
      const ang = (Math.PI * 2 * i) / spokeCount;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      ctx.stroke();
    }

    // リムの足場模様
    ctx.strokeStyle = "rgba(121, 91, 69, 0.35)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (r - 10), Math.sin(ang) * (r - 10));
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      ctx.stroke();
    }
    ctx.restore();

    // 外輪フレーム
    ctx.strokeStyle =
      style === "leaf_wheel" ? "#4F7D55" : style === "star_wheel" ? "#C7873B" : "#795B45";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawWheelFrontHub(ctx, cx, cy, r, style) {
    ctx.save();
    ctx.fillStyle = style === "star_wheel" ? "#F4B942" : "#795B45";
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF8EB";
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEzorisu(ctx, x, y, t, hatStyle) {
    ctx.save();

    let bounceY = 0;
    let bodyTilt = 0;
    let tailWag = Math.sin(t * 3.2) * 0.12;
    let earTwitch = Math.sin(t * 5) > 0.85 ? 0.12 : 0;

    if (this.state === "idle") {
      bounceY = Math.sin(t * 3) * 2.5;
    } else if (this.state === "run") {
      bounceY = -Math.abs(Math.sin(this.wheelAngle * 2.5)) * 10;
      bodyTilt = 0.14 + Math.sin(this.wheelAngle * 2.5) * 0.06;
      tailWag = Math.sin(this.wheelAngle * 2.5) * 0.22;
    } else if (this.state === "fast_run") {
      bounceY = -Math.abs(Math.sin(this.wheelAngle * 3.0)) * 14;
      bodyTilt = 0.24 + Math.sin(this.wheelAngle * 3.0) * 0.08;
      tailWag = Math.sin(this.wheelAngle * 3.5) * 0.3;
    } else if (this.state === "happy") {
      bounceY = -Math.abs(Math.sin(t * 8)) * 22;
      tailWag = Math.sin(t * 10) * 0.28;
    } else if (this.state === "eat") {
      bounceY = Math.sin(t * 10) * 2;
    } else if (this.state === "sleep") {
      bounceY = Math.sin(t * 1.5) * 1.5;
      bodyTilt = -0.08;
    }

    ctx.translate(x, y + bounceY);
    ctx.rotate(bodyTilt);

    // 足元の影
    ctx.fillStyle = "rgba(121, 91, 69, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 30 - bounceY * 0.5, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. ふわふわの大きな尻尾（エゾリスの特徴）
    ctx.save();
    ctx.translate(-22, 10);
    ctx.rotate(tailWag);
    const tailGrad = ctx.createLinearGradient(-45, -65, 0, 15);
    tailGrad.addColorStop(0, "#9E5829");
    tailGrad.addColorStop(0.6, "#C4743D");
    tailGrad.addColorStop(1, "#B06330");
    ctx.fillStyle = tailGrad;
    ctx.strokeStyle = "#6E3A17";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-48, 10, -64, -46, -26, -68);
    ctx.bezierCurveTo(2, -82, 18, -42, 4, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 尻尾のふわふわハイライト
    ctx.fillStyle = "rgba(255, 232, 204, 0.35)";
    ctx.beginPath();
    ctx.ellipse(-24, -36, 12, 20, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. 後ろ足・前足のアニメーション
    const legPhase = this.state === "run" || this.state === "fast_run" ? this.wheelAngle * 2.5 : 0;
    const footOffset1 = Math.sin(legPhase) * 9;
    const footOffset2 = Math.cos(legPhase) * 9;

    ctx.fillStyle = "#9E5829";
    ctx.strokeStyle = "#6E3A17";
    ctx.lineWidth = 2.5;
    // 後ろ足
    ctx.beginPath();
    ctx.ellipse(-8 + footOffset1, 26, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 前足（走っている時）
    ctx.beginPath();
    ctx.ellipse(14 + footOffset2, 26, 10, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. まるっこい胴体
    ctx.fillStyle = "#C87840";
    ctx.strokeStyle = "#6E3A17";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 白いふわふわのお腹
    ctx.fillStyle = "#FFF8EE";
    ctx.beginPath();
    ctx.ellipse(6, 7, 17, 18, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // 4. 頭と耳（エゾリス特有の長いふさ耳毛）
    ctx.save();
    ctx.translate(4, -24);

    // 左耳（奥）
    ctx.save();
    ctx.translate(-12, -20);
    ctx.rotate(-0.18 + earTwitch);
    this.drawEzorisuEar(ctx);
    ctx.restore();

    // 右耳（手前）
    ctx.save();
    ctx.translate(12, -20);
    ctx.rotate(0.18 - earTwitch);
    this.drawEzorisuEar(ctx);
    ctx.restore();

    // 顔の輪郭（ぷっくりほっぺ）
    ctx.fillStyle = "#CD7E46";
    ctx.strokeStyle = "#6E3A17";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ほっぺたの白い毛並み
    ctx.fillStyle = "#FFF6E8";
    ctx.beginPath();
    ctx.ellipse(5, 6, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // ピンクのほっぺ
    const cheekSize = this.state === "eat" ? 6.5 + Math.sin(t * 14) * 1.5 : 5.5;
    ctx.fillStyle = "rgba(235, 115, 110, 0.55)";
    ctx.beginPath();
    ctx.arc(-9, 5, cheekSize, 0, Math.PI * 2);
    ctx.arc(17, 5, cheekSize, 0, Math.PI * 2);
    ctx.fill();

    // 目・表情の描画
    this.drawEyesAndMouth(ctx, t);

    // 帽子・アクセサリーの描画
    this.drawHat(ctx, hatStyle);

    ctx.restore();

    // 5. 手（お食事中は木の実を持つ）
    if (this.state === "eat") {
      ctx.font = "22px sans-serif";
      ctx.fillText(this.eatingFoodIcon || "🌰", 12, 8 + Math.sin(t * 14) * 2);
    } else {
      ctx.fillStyle = "#B86B35";
      ctx.strokeStyle = "#6E3A17";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(14, 6, 7, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 6. 眠っている時の Zzz
    if (this.state === "sleep") {
      ctx.fillStyle = "#6B9B71";
      ctx.font = "bold 16px sans-serif";
      const zOffset = (t * 20) % 24;
      ctx.fillText("Zzz...", 28, -42 - zOffset * 0.5);
    }

    ctx.restore();
  }

  drawEzorisuEar(ctx) {
    // 耳本体
    ctx.fillStyle = "#B86B35";
    ctx.strokeStyle = "#6E3A17";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 耳の内側ピンク
    ctx.fillStyle = "#E8A598";
    ctx.beginPath();
    ctx.ellipse(0, 2, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // エゾリス特有の長い耳毛（冬毛のふさふさ）
    ctx.fillStyle = "#6E3A17";
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.lineTo(-7, -23);
    ctx.lineTo(0, -17);
    ctx.lineTo(6, -24);
    ctx.lineTo(5, -10);
    ctx.closePath();
    ctx.fill();
  }

  drawEyesAndMouth(ctx, t) {
    const isBlinking = this.state === "idle" && Math.sin(t * 2.3) > 0.96;

    ctx.strokeStyle = "#4A2511";
    ctx.fillStyle = "#3B1D0E";
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";

    if (this.state === "happy" || this.state === "eat") {
      // にっこり笑顔の目 (^ ^)
      ctx.beginPath();
      ctx.arc(-5, -3, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(14, -3, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else if (this.state === "sleep" || isBlinking) {
      // すやすや閉じ目
      ctx.beginPath();
      ctx.arc(-5, -3, 4.5, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(14, -3, 4.5, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    } else if (this.state === "miss") {
      // あれっ？と少し困った優しい表情（怒ったり悲しんだりしない）
      ctx.beginPath();
      ctx.arc(-5, -3, 4.8, 0, Math.PI * 2);
      ctx.arc(14, -3, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-6.5, -4.5, 1.8, 0, Math.PI * 2);
      ctx.arc(12.5, -4.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // 優しい汗マーク
      ctx.fillStyle = "#6BB8E8";
      ctx.beginPath();
      ctx.ellipse(-21, -10, 3, 5.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 通常のキラキラした瞳
      ctx.beginPath();
      ctx.arc(-5, -3, 5.2, 0, Math.PI * 2);
      ctx.arc(14, -3, 5.2, 0, Math.PI * 2);
      ctx.fill();

      // 瞳のハイライト
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(-6.5, -5, 2.1, 0, Math.PI * 2);
      ctx.arc(12.5, -5, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // ちょこんとした鼻
    ctx.fillStyle = "#5A2D14";
    ctx.beginPath();
    ctx.ellipse(6, 2, 3.2, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 口元（ω）
    ctx.strokeStyle = "#5A2D14";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (this.state === "miss") {
      ctx.arc(6, 8, 3, 0, Math.PI * 2);
    } else {
      ctx.arc(3, 6, 3.2, 0, Math.PI);
      ctx.arc(9, 6, 3.2, 0, Math.PI);
    }
    ctx.stroke();
  }

  drawHat(ctx, hatStyle) {
    if (!hatStyle || hatStyle === "none") return;
    ctx.save();
    if (hatStyle === "leaf") {
      ctx.fillStyle = "#5E9E64";
      ctx.strokeStyle = "#37663C";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(2, -22, 14, 7, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (hatStyle === "flower") {
      const colors = ["#FFF", "#FFE066", "#FFB5C2", "#FFF"];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(-10 + i * 7, -20, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (hatStyle === "ribbon") {
      ctx.fillStyle = "#E05353";
      ctx.beginPath();
      ctx.moveTo(0, -21);
      ctx.lineTo(-11, -27);
      ctx.lineTo(-11, -15);
      ctx.closePath();
      ctx.moveTo(0, -21);
      ctx.lineTo(11, -27);
      ctx.lineTo(11, -15);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -21, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatStyle === "crown") {
      ctx.fillStyle = "#F5B82E";
      ctx.strokeStyle = "#B87E14";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -18);
      ctx.lineTo(-13, -31);
      ctx.lineTo(-4, -24);
      ctx.lineTo(0, -33);
      ctx.lineTo(4, -24);
      ctx.lineTo(13, -31);
      ctx.lineTo(11, -18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawProgressTrack(ctx, W, H) {
    const padX = 24;
    const trackY = H - 16;
    const trackW = W - padX * 2;

    ctx.save();
    ctx.fillStyle = "rgba(255, 253, 249, 0.85)";
    ctx.beginPath();
    ctx.roundRect(padX, trackY - 7, trackW, 12, 6);
    ctx.fill();

    ctx.fillStyle = "#6B9B71";
    ctx.beginPath();
    ctx.roundRect(padX, trackY - 7, Math.max(12, trackW * this.progressRatio), 12, 6);
    ctx.fill();

    ctx.font = "14px sans-serif";
    ctx.fillText("🌰", padX + Math.min(trackW - 14, trackW * this.progressRatio) - 6, trackY + 4);
    ctx.restore();
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = `${Math.round(p.size + 6)}px sans-serif`;
      if (p.type === "heart") {
        ctx.fillText("❤️", p.x, p.y);
      } else if (p.type === "leaf") {
        ctx.fillText("🍃", p.x, p.y);
      } else if (p.type === "rainbow") {
        ctx.fillText("✨", p.x, p.y);
      } else {
        ctx.fillText("⭐", p.x, p.y);
      }
      ctx.restore();
    }
  }
}
