/* ============================================================
   StudyBuddy — Study Hub logic
   ============================================================ */
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const slug = (s) => (s || "topic").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

    const state = {
        topic: "",
        fileName: "",
        fileText: "",
        notesMd: "",
        quiz: null,          // {questions, answers, submitted}
        cards: [],
        cardIndex: 0,
        chat: [],            // {role, content}
    };

    /* ---- AI status line ---- */
    $("#aiStatus").textContent = SB.ai.live ? "AI connected" : "offline mode";

    /* ================= intake ================= */
    const topicInput = $("#topicInput");
    const fileInput = $("#fileInput");
    const fileDrop = $("#fileDrop");
    const sourceChip = $("#sourceChip");

    fileDrop.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
    ["dragover", "dragleave", "drop"].forEach((ev) =>
        fileDrop.addEventListener(ev, (e) => {
            e.preventDefault();
            $("#dropZone").classList.toggle("drag", ev === "dragover");
            if (ev === "drop") handleFile(e.dataTransfer.files[0]);
        })
    );
    topicInput.addEventListener("input", () => { refreshChip(); refreshTools(); });

    function handleFile(file) {
        if (!file) return;
        state.fileName = file.name;
        $(".fd-text", fileDrop).textContent = file.name;
        refreshChip(); refreshTools();
        if (/\.(txt|md|csv)$/i.test(file.name)) {
            const r = new FileReader();
            r.onload = () => { state.fileText = String(r.result).slice(0, 12000); };
            r.readAsText(file);
        } else {
            state.fileText = ""; // pdf/docx: filename used as the source hint (parse server-side if wired)
        }
    }
    function refreshChip() {
        const t = topicInput.value.trim();
        if (t && state.fileName) sourceChip.textContent = `Topic + ${state.fileName}`;
        else if (t) sourceChip.textContent = `Topic: ${t}`;
        else if (state.fileName) sourceChip.textContent = state.fileName;
        else sourceChip.textContent = "No source yet";
    }

    /* ================= option buttons ================= */
    const tools = $("#tools");
    function hasSource() { return !!(topicInput.value.trim() || state.fileName); }
    function refreshTools() { tools.classList.toggle("hidden", !hasSource()); }

    function currentTopic() {
        return topicInput.value.trim() || (state.fileName ? state.fileName.replace(/\.[^.]+$/, "") : "");
    }

    // when the topic text changes, clear previously generated content
    function onTopicChanged() {
        state.notesMd = ""; state.quiz = null; state.cards = []; state.cardIndex = 0;
        $("#notesBody").innerHTML = `<div class="empty">Click <b>Lectures</b> to generate notes.</div>`;
        $("#downloadBtn").disabled = true;
        $("#cardsArea").innerHTML = `<div class="empty">Click <b>Flashcards</b> to build a deck.</div>`;
        $("#quizArea").innerHTML = `<div class="empty">Click <b>New quiz</b> to begin.</div>`;
        $("#notesTopic").textContent = state.topic;
        $("#chatTopic").textContent = `Tutoring you on: ${state.topic}`;
        resetChat();
        loadAttempts();
    }

    // each option button: set topic, reveal content below, generate if empty
    $$(".tool").forEach((btn) =>
        btn.addEventListener("click", () => openTool(btn.dataset.tab))
    );

    function openTool(name) {
        const t = currentTopic();
        if (!t) { SB.toast("Add a topic or a file first."); topicInput.focus(); return; }
        if (t !== state.topic) { state.topic = t; onTopicChanged(); }

        $("#workspace").classList.remove("hidden");
        $$(".tool").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
        $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === name));

        if (name === "notes" && !state.notesMd) genNotes();
        if (name === "cards" && !state.cards.length) genCards();
        if (name === "quiz" && !state.quiz) genQuiz();

        $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function sourceContext() {
        if (state.fileText) return `\n\nSource material (excerpt):\n${state.fileText}`;
        if (state.fileName) return `\n\n(Source file: ${state.fileName})`;
        return "";
    }

    /* ================= NOTES ================= */
    async function genNotes() {
        const body = $("#notesBody");
        body.innerHTML = `<div class="empty"><span class="spinner"></span> Writing notes…</div>`;
        $("#downloadBtn").disabled = true;
        const md = await SB.ai.complete(
            [{ role: "user", content: `Create detailed, well-structured lecture study notes in Markdown (headings, bullets, a short summary).\nTopic: ${state.topic}${sourceContext()}` }],
            { kind: "notes", maxTokens: 1600, system: "You are a precise study-notes writer. Output clean Markdown only." }
        );
        state.notesMd = md;
        body.innerHTML = mdToHtml(md);
        $("#downloadBtn").disabled = false;
    }
    $("#notesRegen").addEventListener("click", genNotes);

    /* download menu */
    const dlBtn = $("#downloadBtn"), dlMenu = $("#downloadMenu");
    dlBtn.addEventListener("click", (e) => { e.stopPropagation(); dlMenu.hidden = !dlMenu.hidden; });
    document.addEventListener("click", () => (dlMenu.hidden = true));
    dlMenu.addEventListener("click", (e) => {
        const fmt = e.target.dataset.fmt; if (!fmt) return;
        downloadNotes(fmt); dlMenu.hidden = true;
    });
    function downloadNotes(fmt) {
        const name = slug(state.topic) + "-notes";
        let blob, file;
        if (fmt === "md") { blob = new Blob([state.notesMd], { type: "text/markdown" }); file = name + ".md"; }
        if (fmt === "txt") { blob = new Blob([state.notesMd.replace(/[#>*`_]/g, "")], { type: "text/plain" }); file = name + ".txt"; }
        if (fmt === "html") {
            const html = `<!doctype html><meta charset="utf-8"><title>${esc(state.topic)} — Notes</title>` +
                `<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2.5rem auto;padding:0 1.2rem;line-height:1.6;color:#1b1d24}h1,h2,h3{font-family:'Space Grotesk',sans-serif}blockquote{border-left:3px solid #4F46E5;background:#EEEDFC;padding:.5rem 1rem;border-radius:0 8px 8px 0}code{background:#f2efe7;padding:.1em .35em;border-radius:5px}</style>` +
                mdToHtml(state.notesMd);
            blob = new Blob([html], { type: "text/html" }); file = name + ".html";
        }
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: file });
        a.click(); URL.revokeObjectURL(url);
        SB.toast("Downloaded " + file);
    }

    /* ================= QUIZ ================= */
    $("#quizNew").addEventListener("click", genQuiz);
    $("#quizReviewToggle").addEventListener("click", () => {
        const a = $("#attemptsArea"); a.classList.toggle("hidden");
        $("#quizReviewToggle").textContent = a.classList.contains("hidden") ? "🕘 Past attempts" : "✕ Hide attempts";
    });

    async function genQuiz() {
        const area = $("#quizArea");
        area.innerHTML = `<div class="empty"><span class="spinner"></span> Building quiz…</div>`;
        const raw = await SB.ai.complete(
            [{ role: "user", content: `Create a 5-question multiple-choice quiz as strict JSON: {"questions":[{"q":"","options":["","","",""],"answer":0,"why":""}]}. The "answer" is the 0-based index of the correct option. Make this set FRESH and DIFFERENT from a typical quiz — vary the subtopics and difficulty (variation seed ${Math.floor(Math.random() * 1e6)}).\nTopic: ${state.topic}${sourceContext()}` }],
            { kind: "quiz", json: true, maxTokens: 1200, system: "Output strict JSON only, no prose." }
        );
        const data = safeJson(raw);
        if (!data || !data.questions) { area.innerHTML = `<div class="empty">Couldn't build a quiz. Try again.</div>`; return; }
        state.quiz = { questions: data.questions, answers: {}, submitted: false };
        renderQuiz();
    }

    function renderQuiz() {
        const { questions, answers, submitted } = state.quiz;
        const area = $("#quizArea");
        area.innerHTML = questions.map((q, i) => `
      <div class="quiz-q" data-q="${i}">
        <div class="q-text">${esc(q.q)}</div>
        ${q.options.map((o, j) => `
          <label class="quiz-opt" data-opt="${j}">
            <input type="radio" name="q${i}" value="${j}" ${answers[i] === j ? "checked" : ""} ${submitted ? "disabled" : ""}>
            <span>${esc(o)}</span>
          </label>`).join("")}
        <div class="quiz-why" data-why="${i}">${esc(q.why || "")}</div>
      </div>`).join("") +
            (submitted ? "" : `<button class="btn btn-primary quiz-submit" id="quizSubmit">Submit answers</button>`);

        if (submitted) markGraded();

        $$(".quiz-opt input", area).forEach((inp) =>
            inp.addEventListener("change", (e) => { state.quiz.answers[+e.target.closest("[data-q]").dataset.q] = +e.target.value; })
        );
        const sub = $("#quizSubmit"); if (sub) sub.addEventListener("click", submitQuiz);
    }

    function submitQuiz() {
        const { questions, answers } = state.quiz;
        if (Object.keys(answers).length < questions.length) { SB.toast("Answer every question first."); return; }
        state.quiz.submitted = true;
        const correct = questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
        renderQuiz();
        const pct = Math.round((correct / questions.length) * 100);
        const banner = document.createElement("div");
        banner.className = "score-banner";
        banner.innerHTML = `<div class="big">${pct}%<span class="small"> · ${correct}/${questions.length}</span></div><div>${pct >= 80 ? "Strong work — that's locked in." : pct >= 50 ? "Solid. Review the misses and retry." : "Tricky one — revisit the notes and go again."}</div>`;
        $("#quizArea").prepend(banner);
        saveAttempt(correct, questions.length);
    }

    function markGraded() {
        const { questions, answers } = state.quiz;
        questions.forEach((q, i) => {
            const qEl = $(`.quiz-q[data-q="${i}"]`);
            $$(".quiz-opt", qEl).forEach((opt) => {
                const j = +opt.dataset.opt;
                if (j === q.answer) opt.classList.add("correct");
                else if (answers[i] === j) opt.classList.add("wrong");
            });
            $(`.quiz-why[data-why="${i}"]`).classList.add("show");
        });
    }

    /* attempts persistence */
    const attemptsKey = () => "sb_attempts_" + slug(state.topic);
    function saveAttempt(correct, total) {
        const list = SB.ls.get(attemptsKey(), []);
        list.unshift({ t: Date.now(), correct, total, quiz: state.quiz.questions, answers: state.quiz.answers });
        SB.ls.set(attemptsKey(), list.slice(0, 20));
        loadAttempts();
    }
    function loadAttempts() {
        const list = SB.ls.get(attemptsKey(), []);
        renderProgress(list);
        const area = $("#attemptsArea");
        if (!list.length) { area.innerHTML = `<div class="empty">No attempts yet for “${esc(state.topic)}”.</div>`; return; }
        area.innerHTML = `<h3 style="margin-bottom:.7rem">Attempt history — ${esc(state.topic)}</h3>` +
            list.map((a, idx) => {
                const pct = Math.round((a.correct / a.total) * 100);
                const cls = pct >= 80 ? "good" : pct >= 50 ? "mid" : "low";
                return `<div class="attempt-row">
          <span class="when">${new Date(a.t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
          <span class="pct ${cls}">${pct}%</span>
          <span class="muted">${a.correct}/${a.total}</span>
          <button class="btn btn-sm" data-review="${idx}">Review</button>
        </div>`;
            }).join("");
        $$("[data-review]", area).forEach((b) => b.addEventListener("click", () => reviewAttempt(list[+b.dataset.review])));
    }

    /* per-topic progress report: score trend over time */
    function renderProgress(list) {
        const el = $("#progressArea");
        if (!el) return;
        if (!list || !list.length) { el.innerHTML = ""; el.style.display = "none"; return; }
        el.style.display = "";
        const data = [...list].reverse();                 // oldest → newest
        const pcts = data.map((a) => Math.round((a.correct / a.total) * 100));
        const n = pcts.length;
        const avg = Math.round(pcts.reduce((s, v) => s + v, 0) / n);
        const best = Math.max(...pcts);
        const latest = pcts[n - 1];

        let trend = "Steady", arrow = "→", tcls = "mid";
        if (n >= 2) {
            const half = Math.ceil(n / 2);
            const fa = pcts.slice(0, half).reduce((s, v) => s + v, 0) / half;
            const sb = pcts.slice(-half).reduce((s, v) => s + v, 0) / half;
            if (sb - fa >= 5) { trend = "Improving"; arrow = "↗"; tcls = "good"; }
            else if (fa - sb >= 5) { trend = "Slipping"; arrow = "↘"; tcls = "low"; }
        }

        const W = 520, H = 150, pad = 26;
        const X = (i) => (n === 1 ? W / 2 : pad + i * (W - 2 * pad) / (n - 1));
        const Y = (v) => H - pad - (v / 100) * (H - 2 * pad);
        const line = pcts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
        const area = `${X(0).toFixed(1)},${(H - pad)} ` + line + ` ${X(n - 1).toFixed(1)},${(H - pad)}`;
        const dots = pcts.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" class="pdot"></circle>`).join("");
        const grid = [0, 50, 100].map((g) => `<line class="pgrid" x1="${pad}" y1="${Y(g)}" x2="${W - pad}" y2="${Y(g)}"></line><text class="pgl" x="4" y="${Y(g) + 4}">${g}</text>`).join("");

        el.innerHTML = `
      <div class="pr-head">
        <h3>Your ${esc(state.topic)} progress</h3>
        <span class="pr-trend ${tcls}">${arrow} ${trend}</span>
      </div>
      <div class="pr-stats">
        <div class="pr-stat"><b>${n}</b><span>quizzes</span></div>
        <div class="pr-stat"><b>${latest}%</b><span>latest</span></div>
        <div class="pr-stat"><b>${avg}%</b><span>average</span></div>
        <div class="pr-stat"><b>${best}%</b><span>best</span></div>
      </div>
      <svg class="pr-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score over time">
        ${grid}
        <polyline class="parea" points="${area}"></polyline>
        <polyline class="pline" points="${line}"></polyline>
        ${dots}
      </svg>
      <p class="pr-note">${n < 2 ? "Take the quiz again to start a trend line." : trend === "Improving" ? "Nice — your scores are climbing on this topic." : trend === "Slipping" ? "Scores dipped lately. Review the notes and retry." : "Holding steady. Keep going to push it up."}</p>`;
    }
    function reviewAttempt(a) {
        state.quiz = { questions: a.quiz, answers: a.answers, submitted: true };
        $$(".tool").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === "quiz"));
        $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === "quiz"));
        renderQuiz();
        $("#quizArea").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ================= FLASHCARDS ================= */
    $("#cardsNew").addEventListener("click", genCards);
    async function genCards() {
        const area = $("#cardsArea");
        area.innerHTML = `<div class="empty"><span class="spinner"></span> Making cards…</div>`;
        const raw = await SB.ai.complete(
            [{ role: "user", content: `Create 6 study flashcards as strict JSON: {"cards":[{"front":"","back":""}]}.\nTopic: ${state.topic}${sourceContext()}` }],
            { kind: "flashcards", json: true, maxTokens: 1000, system: "Output strict JSON only." }
        );
        const data = safeJson(raw);
        if (!data || !data.cards) { area.innerHTML = `<div class="empty">Couldn't build cards. Try again.</div>`; return; }
        state.cards = data.cards; state.cardIndex = 0;
        renderDeck();
    }
    function renderDeck() {
        const area = $("#cardsArea");
        if (!state.cards.length) { area.innerHTML = `<div class="empty">No cards yet.</div>`; return; }
        const c = state.cards[state.cardIndex];
        area.innerHTML = `
      <div class="deck">
        <div class="flashcard" id="flashcard">
          <div class="flashcard-inner">
            <div class="fc-face fc-front"><span class="fc-tag">Question</span><div class="fc-q">${esc(c.front)}</div></div>
            <div class="fc-face fc-back"><span class="fc-tag">Answer</span><div class="fc-a">${esc(c.back)}</div></div>
          </div>
        </div>
        <div class="deck-nav">
          <button class="btn btn-sm" id="cardPrev">←</button>
          <span class="pos">${state.cardIndex + 1} / ${state.cards.length}</span>
          <button class="btn btn-sm" id="cardNext">→</button>
        </div>
      </div>`;
        $("#flashcard").addEventListener("click", (e) => e.currentTarget.classList.toggle("flipped"));
        $("#cardPrev").addEventListener("click", () => move(-1));
        $("#cardNext").addEventListener("click", () => move(1));
    }
    function move(d) {
        state.cardIndex = (state.cardIndex + d + state.cards.length) % state.cards.length;
        renderDeck();
    }
    document.addEventListener("keydown", (e) => {
        if (!$(".panel[data-panel='cards']").classList.contains("is-active") || !state.cards.length) return;
        if (e.key === "ArrowRight") move(1);
        if (e.key === "ArrowLeft") move(-1);
        if (e.key === " ") { e.preventDefault(); $("#flashcard")?.classList.toggle("flipped"); }
    });

    /* ================= VIDEOS (real YouTube searches) ================= */
    function renderVideos(topic) {
        const picks = [
            { icon: "🎓", title: `${topic} — full lecture`, q: `${topic} full lecture`, sub: "University-style deep dive" },
            { icon: "⚡", title: `${topic} explained simply`, q: `${topic} explained simply`, sub: "Quick intuition build" },
            { icon: "🧪", title: `${topic} — examples & problems`, q: `${topic} examples solved`, sub: "Worked examples" },
            { icon: "📊", title: `${topic} — visual / animated`, q: `${topic} animation visualized`, sub: "See it move" },
            { icon: "⏱️", title: `${topic} crash course`, q: `${topic} crash course`, sub: "Exam-prep speedrun" },
            { icon: "🔬", title: `${topic} — advanced`, q: `${topic} advanced in depth`, sub: "Go deeper" },
        ];
        $("#videosArea").innerHTML = `<div class="vid-grid">` + picks.map((p) =>
            `<a class="vid-card" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(p.q)}">
        <div class="vid-thumb">${p.icon}</div>
        <div class="v-title">${esc(p.title)}</div>
        <div class="v-sub">${esc(p.sub)} ↗</div>
      </a>`).join("") + `</div>`;
    }

    /* ================= CHAT ================= */
    const chatLog = $("#chatLog");
    function resetChat() {
        state.chat = [];
        chatLog.innerHTML = `<div class="chat-empty">Ask me anything about “${esc(state.topic)}”, or type “quiz me”.</div>`;
    }
    $("#chatClear").addEventListener("click", resetChat);
    $("#chatForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = $("#chatText").value.trim(); if (!text) return;
        $("#chatText").value = "";
        if ($(".chat-empty")) chatLog.innerHTML = "";
        pushMsg("user", text);
        const thinking = pushMsg("ai", "…", true);
        const reply = await SB.ai.complete(
            [...state.chat],
            {
                kind: "chat", maxTokens: 700,
                system: `You are StudyBuddy, a warm, sharp tutor. Stay focused on the topic "${state.topic}". Be concise and ask a follow-up that nudges the student forward.${state.notesMd ? "\n\nThe student's notes:\n" + state.notesMd.slice(0, 3000) : ""}`
            }
        );
        thinking.remove();
        pushMsg("ai", reply);
    });
    function pushMsg(role, content, thinking) {
        if (!thinking) state.chat.push({ role: role === "ai" ? "assistant" : "user", content });
        const el = document.createElement("div");
        el.className = `msg ${role}` + (thinking ? " thinking" : "");
        el.textContent = content;
        chatLog.appendChild(el);
        chatLog.scrollTop = chatLog.scrollHeight;
        return el;
    }

    /* ================= helpers ================= */
    function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
    function safeJson(s) { try { return JSON.parse(s); } catch { const m = String(s).match(/\{[\s\S]*\}/); try { return JSON.parse(m[0]); } catch { return null; } } }

    /* tiny Markdown → HTML (headings, bold, italics, code, lists, blockquote) */
    function mdToHtml(md) {
        const lines = String(md).split("\n");
        let html = "", inUl = false, inOl = false;
        const closeLists = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
        const inline = (t) => esc(t)
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>")
            .replace(/`([^`]+)`/g, "<code>$1</code>");
        for (let raw of lines) {
            const line = raw.replace(/\s+$/, "");
            if (/^###\s/.test(line)) { closeLists(); html += `<h3>${inline(line.slice(4))}</h3>`; }
            else if (/^##\s/.test(line)) { closeLists(); html += `<h2>${inline(line.slice(3))}</h2>`; }
            else if (/^#\s/.test(line)) { closeLists(); html += `<h1>${inline(line.slice(2))}</h1>`; }
            else if (/^>\s?/.test(line)) { closeLists(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; }
            else if (/^[-*]\s/.test(line)) { if (!inUl) { closeLists(); html += "<ul>"; inUl = true; } html += `<li>${inline(line.slice(2))}</li>`; }
            else if (/^\d+\.\s/.test(line)) { if (!inOl) { closeLists(); html += "<ol>"; inOl = true; } html += `<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`; }
            else if (line.trim() === "") { closeLists(); }
            else { closeLists(); html += `<p>${inline(line)}</p>`; }
        }
        closeLists();
        return html;
    }
})();