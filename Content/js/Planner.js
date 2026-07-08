/* Planner.js — StudyBuddy Weekly Planner */

(function () {
    'use strict';

    /* ── User scope ──────────────────────────────────
       Reads the logged-in user's id, set elsewhere on the page e.g.:
       <script>window.SB_USER_ID = "@ViewBag.UserId";</script>
       Falls back to "guest" so the planner still works standalone.   */
    const UID = (window.SB_USER_ID && window.SB_USER_ID !== "undefined" && window.SB_USER_ID !== "")
        ? window.SB_USER_ID
        : "guest";

    const PKEY = "sb_planner_" + UID;

    function loadPlanner() {
        if (window.SB && window.SB.ls && typeof window.SB.ls.get === 'function') {
            return window.SB.ls.get(PKEY, {});
        }
        try {
            const raw = localStorage.getItem(PKEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function savePlanner(data) {
        if (window.SB && window.SB.ls && typeof window.SB.ls.set === 'function') {
            window.SB.ls.set(PKEY, data);
            return;
        }
        try {
            localStorage.setItem(PKEY, JSON.stringify(data));
        } catch (e) {
            /* storage unavailable — fail silently */
        }
    }

    /* ── Calendar ──────────────────────────────────── */
    const today = new Date();
    let calYear = today.getFullYear();
    let calMonth = today.getMonth();

    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    function renderCalendar() {
        document.getElementById('calTitle').textContent =
            `${MONTH_NAMES[calMonth]} ${calYear}`;

        const grid = document.getElementById('calDays');
        grid.innerHTML = '';

        const first = new Date(calYear, calMonth, 1);
        let startDow = first.getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;

        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const prevDays = new Date(calYear, calMonth, 0).getDate();

        for (let i = startDow - 1; i >= 0; i--) {
            appendDay(grid, prevDays - i, true, false);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const isToday =
                d === today.getDate() &&
                calMonth === today.getMonth() &&
                calYear === today.getFullYear();

            appendDay(grid, d, false, isToday);
        }

        let next = 1;
        while (grid.children.length % 7 !== 0) {
            appendDay(grid, next++, true, false);
        }
    }

    function appendDay(grid, num, otherMonth, isToday) {
        const el = document.createElement('div');
        el.className =
            'cal-day' +
            (otherMonth ? ' other-month' : '') +
            (isToday ? ' today' : '');

        el.textContent = num;

        if (!otherMonth && !isToday) {
            el.addEventListener('click', () => {
                grid.querySelectorAll('.selected')
                    .forEach(x => x.classList.remove('selected'));
                el.classList.add('selected');
            });
        }

        grid.appendChild(el);
    }

    document.getElementById('prevMonth').addEventListener('click', () => {
        if (--calMonth < 0) {
            calMonth = 11;
            calYear--;
        }
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        if (++calMonth > 11) {
            calMonth = 0;
            calYear++;
        }
        renderCalendar();
    });

    renderCalendar();

    /* ── Week range ──────────────────────────── */
    function getMonday(d) {
        const dt = new Date(d);
        const day = dt.getDay();
        dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
        return dt;
    }

    const mon = getMonday(today);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);

    const fmt = d =>
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    document.getElementById('weekRange').textContent =
        `${fmt(mon)} – ${fmt(fri)}, ${fri.getFullYear()}`;

    /* ── Task Board ──────────────────────────── */

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const daysGrid = document.getElementById('daysGrid');
    const dayLists = {}; // dayName -> its <div class="task-list"> element

    function makeTaskItem(initial) {
        const item = document.createElement('div');
        item.className = 'task-item';

        const box = document.createElement('div');
        box.className = 'task-check';

        const inp = document.createElement('input');
        inp.className = 'task-input';
        inp.type = 'text';
        inp.placeholder = 'To-do';

        const del = document.createElement('button');
        del.className = 'task-delete';
        del.textContent = '✕';

        if (initial) {
            inp.value = initial.text || '';
            if (initial.done) {
                box.classList.add('checked');
                inp.classList.add('done-text');
            }
        }

        box.addEventListener('click', () => {
            box.classList.toggle('checked');
            inp.classList.toggle('done-text', box.classList.contains('checked'));
            updateChart();
            saveAll();
        });

        inp.addEventListener('input', () => {
            updateChart();
            saveAll();
        });

        del.addEventListener('click', () => {
            item.remove();
            updateChart();
            saveAll();
        });

        item.appendChild(box);
        item.appendChild(inp);
        item.appendChild(del);

        return item;
    }

    DAYS.forEach(dayName => {
        const col = document.createElement('div');
        col.className = 'day-col';

        const head = document.createElement('div');
        head.className = 'day-head';
        head.textContent = dayName;

        const list = document.createElement('div');
        list.className = 'task-list';
        dayLists[dayName] = list;

        const addBtn = document.createElement('button');
        addBtn.className = 'add-task-btn';
        addBtn.textContent = '+ Add task';

        addBtn.addEventListener('click', () => {
            list.appendChild(makeTaskItem());
            updateChart();
            saveAll();
        });

        col.appendChild(head);
        col.appendChild(list);
        col.appendChild(addBtn);

        daysGrid.appendChild(col);
    });

    /* ── Persistence (per-user) ──────────────────────────── */

    function saveAll() {
        const data = {};
        DAYS.forEach(dayName => {
            const list = dayLists[dayName];
            data[dayName] = Array.from(list.children).map(item => ({
                text: item.querySelector('.task-input').value,
                done: item.querySelector('.task-check').classList.contains('checked')
            }));
        });
        savePlanner(data);
    }

    function loadAll() {
        const data = loadPlanner();
        DAYS.forEach(dayName => {
            const saved = data[dayName];
            if (!Array.isArray(saved)) return;
            const list = dayLists[dayName];
            saved.forEach(taskData => {
                list.appendChild(makeTaskItem(taskData));
            });
        });
    }

    /* ── Pie Chart ──────────────────────────── */

    const TEAL = '#38d9a9';
    const EMPTY = '#1f3d3d';

    function updateChart() {
        const allBoxes = document.querySelectorAll('.task-check');

        let done = 0;
        allBoxes.forEach(b => {
            if (b.classList.contains('checked')) done++;
        });

        const pend = allBoxes.length - done;

        document.getElementById('doneCount').textContent = done;
        document.getElementById('pendCount').textContent = pend;
        document.getElementById('statDone').textContent = done;
        document.getElementById('statPend').textContent = pend;

        drawDonut(done, pend);
    }

    function drawDonut(done, pend) {
        const svg = document.getElementById('pieSvg');
        svg.innerHTML = '';

        const cx = 70, cy = 70, r = 52, sw = 14;
        const total = done + pend;
        const circ = 2 * Math.PI * r;

        // background ring
        const bg = makeSvgEl('circle', {
            cx, cy, r,
            fill: 'none',
            stroke: EMPTY,
            'stroke-width': sw
        });
        svg.appendChild(bg);

        const fraction = total === 0 ? 0 : done / total;

        // progress ring — rotation now done via transform, not baked
        // into the dashoffset, so it can't eat into the dash length
        // and leave a gap when fraction === 1.
        if (fraction > 0) {
            const arc = makeSvgEl('circle', {
                cx,
                cy,
                r,
                fill: 'none',
                stroke: TEAL,
                'stroke-width': sw,
                'stroke-dasharray': `${circ}`,
                'stroke-dashoffset': `${circ * (1 - fraction)}`,
                'stroke-linecap': 'round',
                transform: `rotate(-90 ${cx} ${cy})`
            });

            svg.appendChild(arc);
        }

        // percentage text
        const pct = Math.round(fraction * 100);

        const num = makeSvgEl('text', {
            x: cx,
            y: cy - 4,
            'text-anchor': 'middle',
            fill: '#0f2e2c',
            'font-size': '22',
            'font-family': 'Playfair Display, serif',
            'font-weight': '700'
        });

        num.textContent = `${pct}%`;

        const sub = makeSvgEl('text', {
            x: cx,
            y: cy + 13,
            'text-anchor': 'middle',
            fill: '#6b8f8c',
            'font-size': '8',
            'font-family': 'Inter, sans-serif'
        });

        sub.textContent = 'COMPLETE';

        svg.appendChild(num);
        svg.appendChild(sub);
    }

    function makeSvgEl(tag, attrs) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }

    /* INIT */
    loadAll();
    updateChart();

})();