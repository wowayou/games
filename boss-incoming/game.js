(() => {
  const BEST_KEY = "boss-incoming-best";
  const COMMENTS = [
    "这也能火？", "老板就在隔壁", "已三连", "家人们谁懂啊",
    "下班倒计时", "别让领导看到", "哈哈哈", "这局稳了",
    "点赞是礼貌", "自动连播真香"
  ];
  const CODE_LINES = [
    "SELECT * FROM kpi WHERE owner='me';",
    "q3_revenue = 1284000",
    "TODO: 把周报写得像加过班",
    "git commit -m 'fix: 对齐口径'",
    "if (boss.nearby) lookBusy();",
    "pivot = sales.groupby('region').sum()",
    "OKR[3] = '提效 12%'",
    "await meeting.survive();"
  ];
  const FAKES = [
    { name: "小王", line: "是小王路过，虚惊一场" },
    { name: "外卖", line: "外卖小哥，不是老板" },
    { name: "保洁", line: "保洁阿姨推门看了一眼" },
    { name: "HR", line: "HR 发问卷，不是来抓人" }
  ];
  const RANKS = [
    [15, "试用期摸鱼"],
    [40, "工位隐身人"],
    [70, "摸鱼达人"],
    [110, "部门传说"],
    [160, "公司隐形人"],
    [Infinity, "摸鱼宗师"]
  ];

  const els = {
    office: document.getElementById("office"),
    overlay: document.getElementById("overlay"),
    menuCard: document.getElementById("menu-card"),
    overCard: document.getElementById("over-card"),
    hudTime: document.getElementById("hud-time"),
    hudCombo: document.getElementById("hud-combo"),
    hudBest: document.getElementById("hud-best"),
    menuBest: document.getElementById("menu-best"),
    alert: document.getElementById("alert"),
    toast: document.getElementById("toast"),
    comments: document.getElementById("comments"),
    workCode: document.getElementById("work-code"),
    holdBtn: document.getElementById("hold-btn"),
    startBtn: document.getElementById("start-btn"),
    retryBtn: document.getElementById("retry-btn"),
    shareBtn: document.getElementById("share-btn"),
    shareHint: document.getElementById("share-hint"),
    overRank: document.getElementById("over-rank"),
    overTitle: document.getElementById("over-title"),
    overReason: document.getElementById("over-reason"),
    overTime: document.getElementById("over-time"),
    overCombo: document.getElementById("over-combo"),
    overBest: document.getElementById("over-best"),
    fx: document.getElementById("fx")
  };

  const ctx = els.fx.getContext("2d");
  const state = {
    phase: "menu",
    working: false,
    time: 0,
    clock: 0,
    combo: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    nextEventAt: 1.4,
    event: null,
    commentTimer: 0,
    codeTimer: 0,
    commentIdx: 0,
    particles: [],
    last: 0,
    reason: ""
  };

  let audio = null;

  function formatTime(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${String(m).padStart(2, "0")}:${r.toFixed(1).padStart(4, "0")}`;
  }

  function rankFor(sec) {
    return RANKS.find(([limit]) => sec < limit)[1];
  }

  function difficulty(t) {
    if (t < 12) return { gap: [2.2, 3.4], warn: 0.9, window: 0.85, fake: 0.35 };
    if (t < 30) return { gap: [1.8, 2.8], warn: 0.72, window: 0.62, fake: 0.42 };
    if (t < 60) return { gap: [1.4, 2.3], warn: 0.55, window: 0.46, fake: 0.5 };
    return { gap: [1.05, 1.8], warn: 0.4, window: 0.32, fake: 0.55 };
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function ensureAudio() {
    if (audio) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    return audio;
  }

  function beep(freq, dur, type, gain) {
    const ac = ensureAudio();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.05, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }

  function setWorking(on) {
    state.working = on;
    document.body.classList.toggle("working", on);
    els.holdBtn.textContent = on ? "正在假装工作" : "按住假装工作";
    if (on) beep(880, 0.05, "triangle", 0.03);
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.classList.remove("show"); }, 1100);
  }

  function showAlert(text, kind) {
    els.alert.textContent = text;
    els.alert.className = kind ? `show ${kind}` : "show";
  }

  function burst(color, n) {
    const x = innerWidth * 0.5;
    const y = innerHeight * 0.22;
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x,
        y,
        vx: rand(-6, 6),
        vy: rand(-8, -1),
        life: rand(18, 36),
        color
      });
    }
  }

  function showBest() {
    const text = state.best > 0 ? formatTime(state.best) : "还没有记录";
    els.hudBest.textContent = state.best > 0 ? formatTime(state.best) : "00:00.0";
    els.menuBest.textContent = text;
  }

  function clearEventVisual() {
    els.office.classList.remove("warn", "boss", "fake");
    els.alert.className = "";
    els.alert.textContent = "";
  }

  function scheduleNext(fromClock) {
    const d = difficulty(fromClock);
    state.nextEventAt = fromClock + rand(d.gap[0], d.gap[1]);
    state.event = null;
    clearEventVisual();
  }

  function startEvent(now) {
    const d = difficulty(now);
    const fake = Math.random() < d.fake;
    const who = fake ? FAKES[Math.floor(Math.random() * FAKES.length)] : { name: "老板", line: "" };
    state.event = {
      kind: fake ? "fake" : "boss",
      who,
      warnAt: now,
      resolveAt: now + d.warn,
      endAt: now + d.warn + d.window
    };
    els.office.classList.add("warn");
    showAlert("有人来了", "warn");
    beep(140, 0.12, "sawtooth", 0.04);
    beep(110, 0.16, "sawtooth", 0.03);
  }

  function resolveEvent() {
    const ev = state.event;
    if (!ev || ev.resolved) return;
    ev.resolved = true;
    els.office.classList.remove("warn");
    if (ev.kind === "boss") {
      els.office.classList.add("boss");
      showAlert("老板来了", "boss");
      if (!state.working) {
        endGame("老板站在你身后，短视频还在自动连播。");
        return;
      }
      state.combo += 1;
      toast(`好险 · 连躲 ${state.combo}`);
      burst("#3dff9a", 18);
      beep(523, 0.08, "square", 0.05);
      beep(784, 0.1, "square", 0.04);
    } else {
      els.office.classList.add("fake");
      showAlert(ev.who.name, "fake");
      if (state.working) toast("切早了，少摸一会儿");
      else {
        state.time += 0.8;
        toast(ev.who.line);
        burst("#ffb020", 10);
      }
    }
  }

  function finishEvent(now) {
    if (state.phase !== "playing") return;
    scheduleNext(now);
  }

  function endGame(reason) {
    state.phase = "over";
    state.reason = reason;
    document.body.classList.add("caught");
    beep(90, 0.45, "sawtooth", 0.08);
    burst("#ff2d2d", 28);
    if (state.time > state.best) {
      state.best = state.time;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    els.overRank.textContent = rankFor(state.time);
    els.overTitle.textContent = "你被抓了";
    els.overReason.textContent = reason;
    els.overTime.textContent = formatTime(state.time);
    els.overCombo.textContent = `${state.combo} 次`;
    els.overBest.textContent = formatTime(state.best);
    els.menuCard.classList.add("hidden");
    els.overCard.classList.remove("hidden");
    els.overlay.classList.add("show");
    showBest();
    setTimeout(clearEventVisual, 400);
  }

  function startGame() {
    ensureAudio()?.resume();
    state.phase = "playing";
    state.working = false;
    state.time = 0;
    state.clock = 0;
    state.combo = 0;
    state.last = 0;
    state.particles.length = 0;
    state.reason = "";
    document.body.classList.remove("caught", "working");
    els.overlay.classList.remove("show");
    els.shareHint.textContent = "";
    state.nextEventAt = 1.35;
    state.event = null;
    clearEventVisual();
    setWorking(false);
    toast("先摸鱼，门口一动就按住");
  }

  function share() {
    const text = `我在《老板来了》摸鱼 ${formatTime(state.time)}，连躲 ${state.combo} 次，头衔「${rankFor(state.time)}」。你能比我更稳吗？`;
    const done = () => { els.shareHint.textContent = "战绩已复制，发给同事一起社死。"; };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        els.shareHint.textContent = text;
      });
    } else {
      els.shareHint.textContent = text;
    }
  }

  function resize() {
    els.fx.width = innerWidth * devicePixelRatio;
    els.fx.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function tick(nowMs) {
    const now = nowMs * 0.001;
    const dt = state.last ? Math.max(0, Math.min(0.05, now - state.last)) : 0.016;
    state.last = now;

    if (state.phase === "playing") {
      state.clock += dt;
      if (!state.working) state.time += dt;
      els.hudTime.textContent = formatTime(state.time);
      els.hudCombo.textContent = String(state.combo);

      state.commentTimer += dt;
      if (state.commentTimer > 0.9) {
        state.commentTimer = 0;
        state.commentIdx = (state.commentIdx + 1) % COMMENTS.length;
        els.comments.textContent = COMMENTS[state.commentIdx];
      }
      state.codeTimer += dt;
      if (state.codeTimer > 0.35) {
        state.codeTimer = 0;
        const lines = [];
        for (let i = 0; i < 8; i++) {
          lines.push(CODE_LINES[(state.commentIdx + i) % CODE_LINES.length]);
        }
        els.workCode.textContent = lines.join("\n");
      }

      if (!state.event && state.clock >= state.nextEventAt) startEvent(state.clock);
      if (state.event && !state.event.resolved && state.clock >= state.event.resolveAt) resolveEvent();
      if (state.event && state.event.resolved && state.clock >= state.event.endAt) finishEvent(state.clock);
    }

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    state.particles = state.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.life -= 1;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / 36);
      ctx.fillRect(p.x, p.y, 4, 4);
      ctx.globalAlpha = 1;
      return p.life > 0;
    });

    window.__BOSS_DEBUG__ = {
      phase: state.phase,
      time: state.time,
      clock: state.clock,
      combo: state.combo,
      working: state.working,
      event: state.event ? state.event.kind : null,
      start: startGame,
      hold: setWorking,
      forceBoss() {
        state.event = {
          kind: "boss",
          who: { name: "老板", line: "" },
          warnAt: state.clock,
          resolveAt: state.clock,
          endAt: state.clock + 0.4
        };
        resolveEvent();
      }
    };

    requestAnimationFrame(tick);
  }

  function bindHold(el) {
    const down = (e) => {
      e.preventDefault();
      if (state.phase !== "playing") return;
      setWorking(true);
    };
    const up = (e) => {
      e.preventDefault();
      setWorking(false);
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (state.phase === "menu" || state.phase === "over") startGame();
      else setWorking(true);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      setWorking(false);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.phase === "playing") setWorking(false);
  });

  els.startBtn.addEventListener("click", startGame);
  els.retryBtn.addEventListener("click", startGame);
  els.shareBtn.addEventListener("click", share);
  bindHold(els.holdBtn);
  window.addEventListener("resize", resize);

  showBest();
  els.comments.textContent = COMMENTS[0];
  els.workCode.textContent = CODE_LINES.join("\n");
  resize();
  requestAnimationFrame(tick);
})();