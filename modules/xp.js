/*
 * XP Messenger 的小脚本：主题伴侣在用这套主题时载入（themes.json 里的 module），换走主题时清理
 * 样子全在主题 CSS 里（themes/xp/mine.css 等），这里只管时间和游戏逻辑
 *
 * 1. 托盘时钟：每分钟把当前时间（「15:45」）写进 --xp-clock，并给 html 加 .xp-has-clock
 * 2. 扫雷：电脑桌面上多一个「扫雷」图标；开始菜单「所有程序(P)」里也能打开（手机从这里进）
 *    左键翻开，右键插旗（手机长按），点已翻开的数字 = 周围旗子数对上时翻开一圈；笑脸 = 重开
 *    逻辑参考 Minesweeper-XP（MIT，Akshay Kalose），画全是重画的
 */
export default function xp() {
    const off = [clock(), minesweeper()];
    return () => off.forEach(f => f?.());
}

function clock() {
    const root = document.documentElement;
    const tick = () => {
        const d = new Date();
        root.style.setProperty('--xp-clock', `'${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}'`);
    };
    tick();
    root.classList.add('xp-has-clock');
    let timer = setTimeout(function next() {
        tick();
        timer = setTimeout(next, 60000 - Date.now() % 60000);
    }, 60000 - Date.now() % 60000);
    return () => {
        clearTimeout(timer);
        root.classList.remove('xp-has-clock');
        root.style.removeProperty('--xp-clock');
    };
}

/* ---------------- 扫雷 ---------------- */
const LEVELS = {
    beginner: { label: '初级(B)', cols: 9, rows: 9, mines: 10 },
    intermediate: { label: '中级(I)', cols: 16, rows: 16, mines: 40 },
    expert: { label: '高级(E)', cols: 30, rows: 16, mines: 99 },
};
const LS_KEY = 'xp_mine_level';

function minesweeper() {
    const el = (tag, cls, html) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    };

    // 入口 1：桌面图标（只在电脑上显示，CSS 管）
    const icon = el('div', 'xp-desk-icon', '扫雷');
    icon.id = 'xp_mine_icon';
    icon.title = '扫雷';
    icon.addEventListener('click', () => open());

    // 入口 2：开始菜单「所有程序(P)」→ 弹出一小列程序
    const allProg = el('div');
    allProg.id = 'xp_allprog';
    const progMenu = el('div', 'xp-progmenu', '<div class="xp-progmenu-item" data-app="mine">扫雷</div>');
    progMenu.id = 'xp_progmenu';
    progMenu.hidden = true;
    allProg.addEventListener('click', (e) => { e.stopPropagation(); progMenu.hidden = !progMenu.hidden; });
    progMenu.addEventListener('click', (e) => {
        if (!e.target.closest('[data-app="mine"]')) return;
        progMenu.hidden = true;
        document.getElementById('rightNavDrawerIcon')?.click();   // 收起开始菜单
        open();
    });
    const attachAllProg = () => {
        const panel = document.getElementById('right-nav-panel');
        if (panel && allProg.parentElement !== panel) panel.append(allProg, progMenu);
    };
    attachAllProg();
    // 开始菜单关上时，程序列表一起收起
    const panelObs = new MutationObserver(() => {
        attachAllProg();
        if (!document.getElementById('right-nav-panel')?.classList.contains('openDrawer')) progMenu.hidden = true;
    });
    const panel = document.getElementById('right-nav-panel');
    if (panel) panelObs.observe(panel, { attributes: true, attributeFilter: ['class'] });

    document.body.append(icon);

    // 游戏窗口
    let win = null, state = null, timer = null;
    let level = 'beginner';
    try { if (LEVELS[localStorage.getItem(LS_KEY)]) level = localStorage.getItem(LS_KEY); } catch { /* 没有存储就用初级 */ }

    function open() {
        if (win) { win.hidden = false; return; }
        win = el('div', 'xp-mine');
        win.id = 'xp_mine';
        win.innerHTML = `
            <div class="xp-mine-title"><span>扫雷</span><button class="xp-mine-close" title="关闭"></button></div>
            <div class="xp-mine-menubar">
                <span class="xp-mine-menu" data-menu="game">游戏(<u>G</u>)</span><span class="xp-mine-menu" data-menu="help">帮助(<u>H</u>)</span>
                <div class="xp-mine-drop" data-drop="game" hidden>
                    <div class="xp-mine-item" data-act="new">开局(<u>N</u>)<i>F2</i></div>
                    <hr>
                    ${Object.entries(LEVELS).map(([k, v]) => `<div class="xp-mine-item" data-act="level" data-level="${k}">${v.label}</div>`).join('')}
                    <hr>
                    <div class="xp-mine-item" data-act="close">退出(<u>X</u>)</div>
                </div>
                <div class="xp-mine-drop" data-drop="help" hidden>
                    <div class="xp-mine-item" data-act="about">关于扫雷(<u>A</u>)...</div>
                </div>
            </div>
            <div class="xp-mine-body">
                <div class="xp-mine-head">
                    <div class="xp-mine-led" data-led="mines"><i></i><i></i><i></i></div>
                    <button class="xp-mine-face" data-face="smile" title="开局"></button>
                    <div class="xp-mine-led" data-led="time"><i></i><i></i><i></i></div>
                </div>
                <div class="xp-mine-grid"></div>
            </div>`;
        document.body.append(win);
        bindWindow();
        newGame();
    }

    function close() {
        clearInterval(timer);
        timer = null;
        win?.remove();
        win = null;
    }

    function bindWindow() {
        const $ = (s) => win.querySelector(s);
        $('.xp-mine-close').addEventListener('click', close);
        $('.xp-mine-face').addEventListener('click', newGame);

        // 菜单
        const drops = [...win.querySelectorAll('.xp-mine-drop')];
        const hideDrops = () => { drops.forEach(d => { d.hidden = true; }); win.querySelectorAll('.xp-mine-menu').forEach(m => m.classList.remove('on')); };
        win.querySelectorAll('.xp-mine-menu').forEach(m => m.addEventListener('click', (e) => {
            e.stopPropagation();
            const d = win.querySelector(`[data-drop="${m.dataset.menu}"]`);
            const wasOpen = !d.hidden;
            hideDrops();
            if (!wasOpen) { d.hidden = false; m.classList.add('on'); }
        }));
        win.addEventListener('click', (e) => {
            if (!win) return;   // 点 × 关掉窗口后，这次点击还会冒泡到这里
            const it = e.target.closest('.xp-mine-item');
            if (it) {
                const act = it.dataset.act;
                if (act === 'new') newGame();
                if (act === 'level') { level = it.dataset.level; try { localStorage.setItem(LS_KEY, level); } catch { /* 忽略 */ } newGame(); }
                if (act === 'close') { close(); return; }
                if (act === 'about') window.toastr?.info('扫雷 —— XP Messenger 附带的小游戏。左键翻开，右键插旗（手机长按），笑脸重新开局。', '关于扫雷');
            }
            if (!e.target.closest('.xp-mine-menu')) hideDrops();
        });
        win.addEventListener('keydown', (e) => { if (e.key === 'F2') { e.preventDefault(); newGame(); } });
        win.tabIndex = -1;

        // 拖标题栏挪窗口（电脑）。拖的时候只改 transform（不重排整页，主题的 :has() 很多，改 left/top 会卡），每帧最多一次；松手再写回 left/top
        const title = $('.xp-mine-title');
        title.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button') || matchMedia('(max-width: 1000px)').matches) return;
            const r = win.getBoundingClientRect();
            const sx = e.clientX, sy = e.clientY;
            let x = r.left, y = r.top, frame = 0;
            title.setPointerCapture(e.pointerId);
            win.classList.add('dragging');
            const move = (ev) => {
                x = Math.max(0, Math.min(innerWidth - 60, r.left + ev.clientX - sx));
                y = Math.max(0, Math.min(innerHeight - 40, r.top + ev.clientY - sy));
                frame ||= requestAnimationFrame(() => { frame = 0; win.style.transform = `translate(${x - r.left}px, ${y - r.top}px)`; });
            };
            const up = () => {
                cancelAnimationFrame(frame);
                title.removeEventListener('pointermove', move);
                title.removeEventListener('pointerup', up);
                title.removeEventListener('pointercancel', up);
                win.classList.remove('dragging');
                win.style.transform = '';
                win.style.left = x + 'px';
                win.style.top = y + 'px';
            };
            title.addEventListener('pointermove', move);
            title.addEventListener('pointerup', up);
            title.addEventListener('pointercancel', up);
        });

        // 格子：左键翻开、右键插旗、长按插旗、按住时笑脸变「哦」
        const grid = $('.xp-mine-grid');
        const face = $('.xp-mine-face');
        let pressTimer = null, longPressed = false;
        grid.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const c = e.target.closest('.xp-mine-cell');
            if (c) flag(+c.dataset.i);
        });
        grid.addEventListener('pointerdown', (e) => {
            const c = e.target.closest('.xp-mine-cell');
            if (!c || state.over || e.button === 2) return;
            face.dataset.face = 'ohh';
            longPressed = false;
            if (e.pointerType !== 'mouse') {
                pressTimer = setTimeout(() => { longPressed = true; flag(+c.dataset.i); navigator.vibrate?.(20); }, 400);
            }
        });
        const release = () => { clearTimeout(pressTimer); if (state && !state.over) face.dataset.face = 'smile'; };
        grid.addEventListener('pointerup', (e) => {
            release();
            const c = e.target.closest('.xp-mine-cell');
            if (!c || longPressed || e.button === 2) return;
            const i = +c.dataset.i;
            if (e.button === 1 || state.open[i]) chord(i);
            else reveal(i);
        });
        grid.addEventListener('pointerleave', release);
        grid.addEventListener('pointercancel', release);
    }

    function newGame() {
        const L = LEVELS[level];
        clearInterval(timer);
        timer = null;
        state = { ...L, n: L.cols * L.rows, mine: [], open: [], flag: [], started: false, over: false, time: 0, left: L.cols * L.rows - L.mines };
        win.style.setProperty('--cols', L.cols);
        win.style.setProperty('--rows', L.rows);
        win.dataset.level = level;
        win.querySelectorAll('[data-level]').forEach(it => it.classList.toggle('checked', it.dataset.level === level));
        const grid = win.querySelector('.xp-mine-grid');
        grid.innerHTML = Array.from({ length: state.n }, (_, i) => `<div class="xp-mine-cell" data-i="${i}"></div>`).join('');
        win.querySelector('.xp-mine-face').dataset.face = 'smile';
        led('mines', L.mines);
        led('time', 0);
    }

    function neighbors(i) {
        const { cols, rows } = state, x = i % cols, y = (i / cols) | 0, out = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
        }
        return out;
    }

    // 第一下点到的格子和它周围一圈不放雷（XP 只保证第一下不是雷，这里再宽一点，开局更顺）
    function layMines(first) {
        const safe = new Set([first, ...neighbors(first)]);
        const pool = [];
        for (let i = 0; i < state.n; i++) if (!safe.has(i)) pool.push(i);
        for (let k = 0; k < state.mines; k++) {
            const j = k + Math.floor(Math.random() * (pool.length - k));
            [pool[k], pool[j]] = [pool[j], pool[k]];
            state.mine[pool[k]] = true;
        }
        state.started = true;
        timer = setInterval(() => { if (state.time < 999) led('time', ++state.time); }, 1000);
        led('time', ++state.time);
    }

    const count = (i) => neighbors(i).filter(j => state.mine[j]).length;
    const cell = (i) => win.querySelector(`.xp-mine-cell[data-i="${i}"]`);

    function reveal(i) {
        if (state.over || state.open[i] || state.flag[i]) return;
        if (!state.started) layMines(i);
        if (state.mine[i]) return lose(i);
        const stack = [i];
        while (stack.length) {
            const j = stack.pop();
            if (state.open[j] || state.flag[j]) continue;
            state.open[j] = true;
            state.left--;
            const n = count(j);
            const c = cell(j);
            c.classList.add('open');
            if (n) c.dataset.n = n;
            else stack.push(...neighbors(j).filter(k => !state.open[k]));
        }
        if (!state.left) win_();
    }

    function chord(i) {
        if (state.over || !state.open[i]) return;
        const nb = neighbors(i);
        if (nb.filter(j => state.flag[j]).length !== count(i)) return;
        nb.forEach(j => { if (!state.open[j] && !state.flag[j]) reveal(j); });
    }

    function flag(i) {
        if (state.over || state.open[i]) return;
        state.flag[i] = !state.flag[i];
        cell(i).classList.toggle('flag', state.flag[i]);
        led('mines', state.mines - state.flag.filter(Boolean).length);
    }

    function lose(i) {
        state.over = true;
        clearInterval(timer);
        for (let j = 0; j < state.n; j++) {
            const c = cell(j);
            if (state.mine[j] && !state.flag[j]) c.classList.add('open', 'mine');
            if (!state.mine[j] && state.flag[j]) c.classList.add('open', 'wrong');
        }
        cell(i).classList.add('boom');
        win.querySelector('.xp-mine-face').dataset.face = 'dead';
    }

    function win_() {
        state.over = true;
        clearInterval(timer);
        for (let j = 0; j < state.n; j++) if (state.mine[j]) { state.flag[j] = true; cell(j).classList.add('flag'); }
        led('mines', 0);
        win.querySelector('.xp-mine-face').dataset.face = 'cool';
    }

    function led(which, v) {
        const s = v < 0 ? '-' + String(Math.min(99, -v)).padStart(2, '0') : String(Math.min(999, v)).padStart(3, '0');
        win.querySelectorAll(`[data-led="${which}"] i`).forEach((d, k) => { d.dataset.d = s[k] === '-' ? 'm' : s[k]; });
    }

    return () => {
        close();
        panelObs.disconnect();
        icon.remove();
        allProg.remove();
        progMenu.remove();
    };
}
