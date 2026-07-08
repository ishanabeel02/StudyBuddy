/* ============================================================
   StudyBuddy — shared layout script
   Exposes a tiny global `SB` used by every page:
     SB.ls        localStorage get/set (JSON-safe)
     SB.toast()   bottom snackbar
     SB.streak    daily study-streak counter (renders into nav)
   ============================================================ */
(function () {
    const SB = (window.SB = window.SB || {});

    /* ---- storage ---- */
    SB.ls = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
            catch { return fallback; }
        },
        set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } },
        del(key) { try { localStorage.removeItem(key); } catch { } },
    };

    /* ---- toast ---- */
    let toastEl, toastTimer;
    SB.toast = function (msg) {
        if (!toastEl) {
            toastEl = document.createElement("div");
            toastEl.id = "toast";
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
    };

    /* ---- daily streak ---- */
    const todayKey = () => new Date().toISOString().slice(0, 10);
    function dayDiff(a, b) {
        const da = new Date(a + "T00:00"), db = new Date(b + "T00:00");
        return Math.round((db - da) / 86400000);
    }

    SB.streak = {
        get KEY() {
            const uid = (window.SB_USER_ID && window.SB_USER_ID !== "undefined" && window.SB_USER_ID !== "")
                ? window.SB_USER_ID
                : "guest";
            return "sb_streak_" + uid;
        },
        read() { return SB.ls.get(this.KEY, { count: 0, last: null, best: 0 }); },
        touch() {
            const s = this.read();
            const t = todayKey();
            if (s.last === t) { /* already counted today */ }
            else if (s.last && dayDiff(s.last, t) === 1) { s.count += 1; s.last = t; }
            else { s.count = 1; s.last = t; }
            s.best = Math.max(s.best || 0, s.count);
            SB.ls.set(this.KEY, s);
            return s;
        },
        render() {
            const el = document.getElementById("streak");
            if (!el) return;
            const s = this.touch();
            const cold = s.count <= 0;
            el.classList.toggle("is-cold", cold);
            el.innerHTML =
                `<span class="flame">${cold ? "🪵" : "🔥"}</span>` +
                `<span class="count">${s.count}</span>` +
                `<span class="lbl">day${s.count === 1 ? "" : "s"}</span>`;
            el.title = `Best streak: ${s.best} day${s.best === 1 ? "" : "s"}. Show up every day to keep the fire alive.`;
        },
    };

    /* ---- mark the active nav link ---- */
    function markActive() {
        const page = document.body.getAttribute("data-page");
        document.querySelectorAll(".nav-link").forEach((a) => {
            if (a.getAttribute("data-page") === page) a.setAttribute("aria-current", "page");
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (typeof markActive === 'function') markActive();
        if (typeof SB !== 'undefined' && SB.streak) SB.streak.render();

        const hamburger = document.querySelector('.hamburger');
        const navLinks = document.querySelector('.nav-links');
        if (hamburger && navLinks) {
            hamburger.addEventListener('click', () => {
                navLinks.classList.toggle('active');
            });
            navLinks.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    navLinks.classList.remove('active');
                });
            });
        }
    });
  
  
})();