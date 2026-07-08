/* ============================================================
   StudyBuddy — Focus Timer (FIXED)
   ============================================================ */
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- flip-clock engine ---------- */
    function buildGroup(el) {
        el.innerHTML = `
      <div class="flip-card" data-val="0">
        <div class="face top"><span class="d">0</span></div>
        <div class="face bottom"><span class="d">0</span></div>
        <div class="flap flap-top"><span class="d">0</span></div>
        <div class="flap flap-bottom"><span class="d">0</span></div>
      </div>`;

        const card = $(".flip-card", el);

        return {
            set(ch) {
                const cur = card.dataset.val;
                if (cur === ch) return;

                const topFace = $(".face.top .d", card);
                const botFace = $(".face.bottom .d", card);
                const flapTop = $(".flap-top .d", card);
                const flapBot = $(".flap-bottom .d", card);

                topFace.textContent = ch;
                botFace.textContent = cur;
                flapTop.textContent = cur;
                flapBot.textContent = ch;

                if (reduce) {
                    settle();
                    return;
                }

                card.classList.remove("go");
                void card.offsetWidth;
                card.classList.add("go");

                clearTimeout(card._t);
                card._t = setTimeout(settle, 580);

                function settle() {
                    card.classList.remove("go");
                    botFace.textContent = ch;
                    flapTop.textContent = ch;
                    card.dataset.val = ch;
                }
            }
        };
    }

    const groups = {
        m1: buildGroup($('[data-unit="m1"]')),
        m2: buildGroup($('[data-unit="m2"]')),
        s1: buildGroup($('[data-unit="s1"]')),
        s2: buildGroup($('[data-unit="s2"]')),
    };

    /* ---------- FIX: prevent repeated rendering ---------- */
    let lastStr = "";

    function showTime(totalSec) {
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;

        const str =
            String(m).padStart(2, "0") +
            String(s).padStart(2, "0");

        if (str === lastStr) return; // 🔥 stops vibration bug
        lastStr = str;

        groups.m1.set(str[0]);
        groups.m2.set(str[1]);
        groups.s1.set(str[2]);
        groups.s2.set(str[3]);

        document.title = `${str.slice(0, 2)}:${str.slice(2)} · StudyBuddy`;
    }

    /* ---------- pomodoro state ---------- */
    const stage = $("#stage");
    const cfg = {
        study: 25,
        break: 5,
        auto: true,
        sound: true,
    };

    let mode = "study";
    let remaining = cfg.study * 60;
    let running = false;
    let tick = null;

    let sessions = SB.ls.get("sb_sessions_" + today(), 0);

    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    function setMode(m, { keepRunning = false } = {}) {
        mode = m;
        stage.dataset.mode = m;

        $("#modeStudy").classList.toggle("is-active", m === "study");
        $("#modeBreak").classList.toggle("is-active", m === "break");

        $("#phaseLabel").textContent =
            m === "study" ? "Focus session" : "Break — step away";

        remaining = (m === "study" ? cfg.study : cfg.break) * 60;

        showTime(remaining);

        if (!keepRunning) stop(false);
    }

    function start() {
        if (running) return;

        running = true;
        $("#startBtn").innerHTML = "⏸ Pause";
        $("#startBtn").classList.remove("btn-primary");

        const end = Date.now() + remaining * 1000;

        /* ---------- FIX: update every 1 second ---------- */
        tick = setInterval(() => {
            const newRemaining = Math.max(
                0,
                Math.round((end - Date.now()) / 1000)
            );

            if (newRemaining !== remaining) {
                remaining = newRemaining;
                showTime(remaining);
            }

            if (remaining <= 0) finishPhase();
        }, 1000);
    }

    function pause() {
        running = false;
        clearInterval(tick);

        $("#startBtn").innerHTML = "▶ Resume";
        $("#startBtn").classList.add("btn-primary");
    }

    function stop(resetLabel = true) {
        running = false;
        clearInterval(tick);

        $("#startBtn").innerHTML = "▶ Start";
        $("#startBtn").classList.add("btn-primary");
    }

    function reset() {
        stop();
        remaining = (mode === "study" ? cfg.study : cfg.break) * 60;
        showTime(remaining);
    }

    function finishPhase() {
        clearInterval(tick);
        running = false;

        chime();

        if (mode === "study") {
            sessions++;
            SB.ls.set("sb_sessions_" + today(), sessions);
            renderSessions();
            SB.toast("Nice — focus session done. Time for a break.");
            setMode("break", { keepRunning: true });
        } else {
            SB.toast("Break over. Back to it.");
            setMode("study", { keepRunning: true });
        }

        if (cfg.auto) start();
        else stop();
    }

    /* ---------- sessions UI ---------- */
    function renderSessions() {
        $("#sessionCount").textContent = sessions;
        const dots = $("#dots");
        const shown = Math.max(4, sessions);

        dots.innerHTML = Array.from(
            { length: shown },
            (_, i) => `<i class="${i < sessions ? "on" : ""}"></i>`
        ).join("");
    }

    /* ---------- chime ---------- */
    let actx;

    function chime() {
        if (!cfg.sound) return;

        try {
            actx =
                actx ||
                new (window.AudioContext || window.webkitAudioContext)();

            [0, 0.18].forEach((t, i) => {
                const o = actx.createOscillator();
                const g = actx.createGain();

                o.type = "sine";
                o.frequency.value = i ? 660 : 880;

                o.connect(g);
                g.connect(actx.destination);

                const s = actx.currentTime + t;

                g.gain.setValueAtTime(0.0001, s);
                g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, s + 0.32);

                o.start(s);
                o.stop(s + 0.34);
            });
        } catch { }
    }

    /* ---------- controls ---------- */
    $("#startBtn").addEventListener("click", () =>
        running ? pause() : start()
    );

    $("#resetBtn").addEventListener("click", reset);

    $("#modeStudy").addEventListener("click", () => setMode("study"));
    $("#modeBreak").addEventListener("click", () => setMode("break"));

    $("#studyMins").addEventListener("change", (e) => {
        cfg.study = clamp(+e.target.value, 1, 90);
        $("#modeStudy").textContent = `📖 Study · ${cfg.study}`;
        if (mode === "study" && !running) reset();
    });

    $("#breakMins").addEventListener("change", (e) => {
        cfg.break = clamp(+e.target.value, 1, 30);
        $("#modeBreak").textContent = `☕ Break · ${cfg.break}`;
        if (mode === "break" && !running) reset();
    });

    $("#autoNext").addEventListener("change", (e) => (cfg.auto = e.target.checked));
    $("#soundOn").addEventListener("change", (e) => (cfg.sound = e.target.checked));

    document.addEventListener("keydown", (e) => {
        if (e.code === "Space" && e.target.tagName !== "INPUT") {
            e.preventDefault();
            running ? pause() : start();
        }
    });

    function clamp(n, lo, hi) {
        return Math.min(hi, Math.max(lo, n || lo));
    }

    /* ---------- init ---------- */
    showTime(remaining);
    renderSessions();
})();