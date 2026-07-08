/* ============================================================
   StudyBuddy — AI wrapper
   ------------------------------------------------------------
   ONE place to wire your model. Point `endpoint` at a backend
   that proxies the Anthropic Messages API (so your key never
   ships to the browser). Your StudyBuddy ASP.NET app already
   does this — just set the URL below.

   The backend should accept:
     POST { system, messages:[{role,content}], max_tokens, json }
   and return:
     { text: "..." }            // plain completion
   …or the raw Anthropic response (this wrapper reads
     data.text  OR  data.content[].text).

   If no endpoint is set (or the call fails), the app falls back
   to OFFLINE MODE: it builds structured, topic-shaped content
   locally so every screen still works for a demo.
   ============================================================ */
(function () {
    const SB = (window.SB = window.SB || {});

    const AI = (SB.ai = {
        config: {
            endpoint: "/Ai/Complete",
            model: "llama-3.3-70b-versatile",
            maxTokens: 1200,
        },

        get live() { return !!this.config.endpoint; },

        /* Core call. Returns a string. `opts.json` requests strict JSON. */
        async complete(messages, opts = {}) {
            const system = opts.system || "";
            if (this.live) {
                try {
                    const res = await fetch(this.config.endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: this.config.model,
                            max_tokens: opts.maxTokens || this.config.maxTokens,
                            system,
                            messages,
                            json: !!opts.json,
                        }),
                    });
                    if (!res.ok) throw new Error("HTTP " + res.status);
                    const data = await res.json();
                    const text =
                        data.text ??
                        (Array.isArray(data.content)
                            ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
                            : "");
                    if (!text) throw new Error("empty response");
                    return opts.json ? stripFences(text) : text;
                } catch (err) {
                    console.warn("[SB.ai] live call failed, using offline fallback:", err.message);
                    SB.toast && SB.toast("AI endpoint unreachable — showing offline sample.");
                }
            }
            return offline(messages, opts);
        },
    });

    function stripFences(s) { return s.replace(/```(?:json)?/g, "").trim(); }

    /* ---------------- OFFLINE FALLBACK ----------------
       Not a model — just enough structured content to make
       every feature demonstrable without a backend.        */
    function lastUser(messages) {
        for (let i = messages.length - 1; i >= 0; i--)
            if (messages[i].role === "user") return messages[i].content;
        return "";
    }
    function topicFrom(text) {
        const m = String(text).match(/topic:\s*(.+)/i);
        return (m ? m[1] : text).split("\n")[0].slice(0, 80).trim() || "your topic";
    }

    function offline(messages, opts) {
        const kind = opts.kind || "notes";
        const topic = topicFrom(lastUser(messages));
        const T = topic.charAt(0).toUpperCase() + topic.slice(1);

        if (kind === "quiz") {
            return JSON.stringify({
                questions: Array.from({ length: 5 }, (_, i) => ({
                    q: `(${i + 1}) Which statement best reflects a key idea in ${T}?`,
                    options: [
                        `A foundational principle of ${T}`,
                        `An unrelated concept`,
                        `A common misconception about ${T}`,
                        `None of the above`,
                    ],
                    answer: 0,
                    why: `Sample item — connect an AI endpoint in js/ai.js for real, ${T}-specific questions.`,
                })),
            });
        }

        if (kind === "flashcards") {
            return JSON.stringify({
                cards: [
                    { front: `Define: ${T}`, back: `A concise definition of ${T} goes here.` },
                    { front: `Key term in ${T}`, back: `Explanation of the term and why it matters.` },
                    { front: `Why does ${T} matter?`, back: `Its real-world significance and applications.` },
                    { front: `Common pitfall in ${T}`, back: `A frequent mistake learners make — and the fix.` },
                    { front: `Example of ${T}`, back: `A worked example that makes the idea concrete.` },
                ],
            });
        }

        if (kind === "chat") {
            return `Offline mode is on, so I can't reason about "${T}" yet. ` +
                `Set an AI endpoint in js/ai.js (config.endpoint) and I'll discuss this topic with you like a tutor — ` +
                `quoting your notes, answering follow-ups, and quizzing you on the spot.`;
        }

        /* notes (markdown) */
        return [
            `# ${T} — Study Notes`,
            ``,
            `> Offline sample. Wire an AI endpoint in **js/ai.js** for full notes generated from your topic or uploaded file.`,
            ``,
            `## 1. Overview`,
            `${T} is introduced here with its core definition and the problem it addresses.`,
            ``,
            `## 2. Key concepts`,
            `- **Concept A** — what it is and why it matters.`,
            `- **Concept B** — how it relates to Concept A.`,
            `- **Concept C** — a common point of confusion.`,
            ``,
            `## 3. How it works`,
            `A step-by-step walkthrough of the main mechanism or process behind ${T}.`,
            ``,
            `## 4. Worked example`,
            `A concrete example applying the ideas above.`,
            ``,
            `## 5. Summary`,
            `- ${T} matters because …`,
            `- The three things to remember are …`,
            `- Next, review the flashcards and take the quiz.`,
            ``,
        ].join("\n");
    }
})();