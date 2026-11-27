// 扫雷（来自 XP Messenger）· 主题伴侣「小部件」
// 一份代码两种用法：
// 1. 命名导出 LEVELS / createGame / bindGrid：游戏逻辑和格子上的操作（左键翻、右键插旗、长按插旗、点数字翻一圈），和长什么样无关。
//    XP Messenger 主题脚本（themes/xp/companion.js）import 这几样，自己画 XP 风格的窗口（桌面图标、开始菜单里进）。
// 2. 默认导出 mount(api)：客串。魔杖菜单多一项「扫雷」+ 斜杠命令 /minesweeper，打开一个浮动小窗；
//    样式自带，底、字、边框跟当前主题走（--SmartThemeBlurTintColor / BodyColor / BorderColor，没有就用默认色），数字颜色按底色亮暗选两套。
//    电脑上可拖标题栏、记住位置；手机上是贴底的整宽卡片。
// 逻辑参考 Minesweeper-XP（MIT，Akshay Kalose），画全是重画的。

export const LEVELS = {
    beginner: { label: '初级', cols: 9, rows: 9, mines: 10 },
    intermediate: { label: '中级', cols: 16, rows: 16, mines: 40 },
    expert: { label: '高级', cols: 30, rows: 16, mines: 99 },
};

/**
 * 游戏逻辑。view 是一组回调，用来把状态画出来：
 *   reset(L, level)、open(i, n)（翻开，n = 周围雷数）、flag(i, on)、mine(i)（失败后露出的雷）、wrong(i)（失败后标错的旗）、
 *   boom(i)（踩中的那颗）、led('mines'|'time', 数)、face('smile'|'ohh'|'dead'|'cool')、end('win'|'lose')（可选）
 */
export function createGame(view) {
    let s = null, timer = null;
    const stop = () => { clearInterval(timer); timer = null; };

    function neighbors(i) {
        const { cols, rows } = s, x = i % cols, y = (i / cols) | 0, out = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
        }
        return out;
    }
    const count = i => neighbors(i).filter(j => s.mine[j]).length;

    function newGame(level) {
        const L = LEVELS[level];
        stop();
        s = { ...L, level, n: L.cols * L.rows, mine: [], open: [], flag: [], started: false, over: false, time: 0, left: L.cols * L.rows - L.mines };
        view.reset(L, level);
        view.face('smile');
        view.led('mines', L.mines);
        view.led('time', 0);
    }

    // 第一下点到的格子和它周围一圈不放雷（XP 只保证第一下不是雷，这里再宽一点，开局更顺）
    function layMines(first) {
        const safe = new Set([first, ...neighbors(first)]);
        const pool = [];
        for (let i = 0; i < s.n; i++) if (!safe.has(i)) pool.push(i);
        for (let k = 0; k < s.mines; k++) {
            const j = k + Math.floor(Math.random() * (pool.length - k));
            [pool[k], pool[j]] = [pool[j], pool[k]];
            s.mine[pool[k]] = true;
        }
        s.started = true;
        timer = setInterval(() => { if (s.time < 999) view.led('time', ++s.time); }, 1000);
        view.led('time', ++s.time);
    }

    function reveal(i) {
        if (s.over || s.open[i] || s.flag[i]) return;
        if (!s.started) layMines(i);
        if (s.mine[i]) return lose(i);
        const stack = [i];
        while (stack.length) {
            const j = stack.pop();
            if (s.open[j] || s.flag[j]) continue;
            s.open[j] = true;
            s.left--;
            const n = count(j);
            view.open(j, n);
            if (!n) stack.push(...neighbors(j).filter(k => !s.open[k]));
        }
        if (!s.left) win();
    }

    function chord(i) {
        if (s.over || !s.open[i]) return;
        const nb = neighbors(i);
        if (nb.filter(j => s.flag[j]).length !== count(i)) return;
        nb.forEach(j => { if (!s.open[j] && !s.flag[j]) reveal(j); });
    }

    function flag(i) {
        if (s.over || s.open[i]) return;
        s.flag[i] = !s.flag[i];
        view.flag(i, s.flag[i]);
        view.led('mines', s.mines - s.flag.filter(Boolean).length);
    }

    function lose(i) {
        s.over = true;
        stop();
        for (let j = 0; j < s.n; j++) {
            if (s.mine[j] && !s.flag[j]) view.mine(j);
            if (!s.mine[j] && s.flag[j]) view.wrong(j);
        }
        view.boom(i);
        view.face('dead');
        view.end?.('lose');
    }

    function win() {
        s.over = true;
        stop();
        for (let j = 0; j < s.n; j++) if (s.mine[j]) { s.flag[j] = true; view.flag(j, true); }
        view.led('mines', 0);
        view.face('cool');
        view.end?.('win');
    }

    return { newGame, reveal, chord, flag, stop, get state() { return s; } };
}

/**
 * 格子上的操作：左键翻开、右键插旗、触屏长按插旗、中键 / 点已翻开的数字 = 翻一圈；按住时笑脸变「哦」。
 * 格子元素带 data-i（序号），选择器 cellSel 认它。返回解绑函数。
 */
export function bindGrid(grid, game, { cellSel, face }) {
    let pressTimer = null, longPressed = false;
    const on = (type, fn) => grid.addEventListener(type, fn);
    const idx = e => { const c = e.target.closest(cellSel); return c ? +c.dataset.i : -1; };
    const ctxmenu = e => { e.preventDefault(); const i = idx(e); if (i >= 0) game.flag(i); };
    const down = e => {
        const s = game.state;
        if (idx(e) < 0 || !s || s.over || e.button === 2) return;
        face('ohh');
        longPressed = false;
        const i = idx(e);
        if (e.pointerType !== 'mouse') {
            pressTimer = setTimeout(() => { longPressed = true; game.flag(i); navigator.vibrate?.(20); }, 400);
        }
    };
    const release = () => { clearTimeout(pressTimer); const s = game.state; if (s && !s.over) face('smile'); };
    const up = e => {
        release();
        const i = idx(e);
        if (i < 0 || longPressed || e.button === 2) return;
        if (e.button === 1 || game.state.open[i]) game.chord(i);
        else game.reveal(i);
    };
    on('contextmenu', ctxmenu);
    on('pointerdown', down);
    on('pointerup', up);
    on('pointerleave', release);
    on('pointercancel', release);
    return () => {
        clearTimeout(pressTimer);
        grid.removeEventListener('contextmenu', ctxmenu);
        grid.removeEventListener('pointerdown', down);
        grid.removeEventListener('pointerup', up);
        grid.removeEventListener('pointerleave', release);
        grid.removeEventListener('pointercancel', release);
    };
}

/* ---------------- 客串：浮动小窗 ---------------- */
const POS_KEY = 'dnw_mine_pos';
const FLAG_SVG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M6 2.5v15M3.5 17.5h9' stroke='%23000' stroke-width='2' stroke-linecap='round' fill='none'/%3E%3Cpath d='M6.5 3l9 3.8-9 3.8z' fill='%23000'/%3E%3C/svg%3E\")";
const MINE_SVG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cg stroke='%23000' stroke-width='1.8' stroke-linecap='round'%3E%3Cpath d='M10 2v16M2 10h16M4.3 4.3l11.4 11.4M15.7 4.3L4.3 15.7'/%3E%3C/g%3E%3Ccircle cx='10' cy='10' r='5.2' fill='%23000'/%3E%3C/svg%3E\")";

const CSS = `
#msw { --msw-bg: #26262b; --msw-fg: #e8e8ee; --msw-bd: #55555e; --msw-closed: #44444c; --msw-open: #2d2d33; --msw-flag: #ff7b7b; --msw-mine: #e8e8ee; --msw-boom: #7a2a2a; --msw-dim: #b4b4c0; --msw-hover: #54545d;
    position: fixed; z-index: 4000; box-sizing: border-box; display: flex; flex-direction: column; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px);
    background: var(--msw-bg); color: var(--msw-fg); border: 1px solid var(--msw-bd); border-radius: 10px; box-shadow: 0 10px 34px rgba(0, 0, 0, .4);
    font: 14px/1.3 system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; user-select: none; -webkit-user-select: none; touch-action: manipulation; outline: none; }
#msw.dragging { will-change: transform; }
#msw button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--msw-bd); border-radius: 6px; padding: 3px 9px; cursor: pointer; margin: 0; box-shadow: none; }
#msw button:hover { background: var(--msw-hover); }
#msw button.on { background: var(--msw-fg); color: var(--msw-bg); border-color: var(--msw-fg); }
#msw .msw-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--msw-bd); cursor: grab; flex: none; }
#msw.dragging .msw-head { cursor: grabbing; }
#msw .msw-title { font-weight: 700; margin-right: auto; }
#msw .msw-x { padding: 1px 8px; font-size: 16px; line-height: 1.2; }
#msw .msw-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px 0; flex: none; }
#msw .msw-num { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 17px; min-width: 4.2em; }
#msw .msw-num small { font-weight: 400; font-size: 12px; color: var(--msw-dim); margin-right: 4px; }
#msw .msw-body { padding: 10px 12px 6px; overflow: auto; flex: 0 1 auto; }
#msw .msw-grid { --cell: 26px; display: grid; grid-template-columns: repeat(var(--cols, 9), var(--cell)); grid-auto-rows: var(--cell); gap: 2px; width: max-content; margin: 0 auto; }
#msw .msw-cell { box-sizing: border-box; background: var(--msw-closed); border-radius: 4px; display: grid; place-items: center; font-weight: 700; font-size: calc(var(--cell) * .58); line-height: 1; font-variant-numeric: tabular-nums; position: relative; cursor: pointer; }
#msw .msw-cell.open { background: var(--msw-open); cursor: default; }
#msw .msw-cell[data-n]::after { content: attr(data-n); }
#msw .msw-cell[data-n="1"] { color: var(--msw-n1); } #msw .msw-cell[data-n="2"] { color: var(--msw-n2); } #msw .msw-cell[data-n="3"] { color: var(--msw-n3); } #msw .msw-cell[data-n="4"] { color: var(--msw-n4); }
#msw .msw-cell[data-n="5"] { color: var(--msw-n5); } #msw .msw-cell[data-n="6"] { color: var(--msw-n6); } #msw .msw-cell[data-n="7"] { color: var(--msw-n7); } #msw .msw-cell[data-n="8"] { color: var(--msw-n8); }
#msw .msw-cell.flag::after, #msw .msw-cell.mine::after { content: ''; position: absolute; inset: 18%; background: var(--msw-flag); -webkit-mask: var(--msw-i-flag) center / contain no-repeat; mask: var(--msw-i-flag) center / contain no-repeat; }
#msw .msw-cell.mine::after { background: var(--msw-mine); -webkit-mask-image: var(--msw-i-mine); mask-image: var(--msw-i-mine); }
#msw .msw-cell.wrong::before { content: ''; position: absolute; inset: 8%; z-index: 1; background: linear-gradient(to top right, transparent calc(50% - 1.5px), var(--msw-fg) calc(50% - 1.5px) calc(50% + 1.5px), transparent calc(50% + 1.5px)); }
#msw .msw-cell.boom { background: var(--msw-boom); }
#msw .msw-cell.boom::after { background: var(--msw-boomfg, var(--msw-fg)); }
#msw .msw-foot { padding: 4px 12px 10px; font-size: 12px; color: var(--msw-dim); text-align: center; flex: none; }
#msw .msw-foot b { color: var(--msw-fg); }
@media (max-width: 1000px) {
    /* 手机上酒馆的 <html> 带 transform 且高度是 0（fixed 的参照框变成它），所以不用 bottom: 0，改成「顶边在屏幕底、再上移自身高度」 */
    #msw { left: 0 !important; right: 0 !important; bottom: auto !important; top: 100vh !important; top: 100dvh !important; transform: translateY(-100%) !important; max-width: none; width: auto; border-radius: 14px 14px 0 0; border-bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px); max-height: 80vh; }
    #msw .msw-head { cursor: default; }
    #msw .msw-grid { --cell: clamp(20px, calc((100vw - 48px - (var(--cols, 9) - 1) * 2px) / var(--cols, 9)), 34px); }
    #msw button { padding: 6px 12px; }
}
`;

// ---- 颜色小工具 ----
const probe = () => { const e = document.createElement('span'); e.style.display = 'none'; document.body.append(e); return e; };
function toRgb(str, fallback) {
    // 让浏览器把任意写法的颜色变成 rgb(a)；认不出就用 fallback
    const e = probe();
    e.style.color = '';
    e.style.color = str || '';
    let c = e.style.color ? getComputedStyle(e).color : '';
    e.remove();
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.%]+))?/.exec(c);
    if (!m) return fallback;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return [+m[1], +m[2], +m[3], a];
}
const over = (top, under) => [0, 1, 2].map(k => top[k] * top[3] + under[k] * (1 - top[3]));
const mix = (a, b, t) => [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * t);
const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const css = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;
// 把 c 往黑 / 白方向推（按底色亮暗），直到和 bgs 里每个底色的对比度都 ≥ min
function ensure(c, bgs, min, toward) {
    let t = 0, out = c;
    while (t <= 1 && bgs.some(b => ratio(out, b) < min)) { t += .05; out = mix(c, toward, t); }
    return out;
}

const NUM_DARK = ['#6cb4ff', '#5fd38d', '#ff8a8a', '#b9a3ff', '#ffb454', '#4fd1d1', '#e6e6e6', '#ff9ed2'];
const NUM_LIGHT = ['#0b5cd5', '#1b7a3a', '#c4262e', '#5b2a9e', '#9a4a00', '#006d77', '#333333', '#6b6b6b'];
const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));

// 从当前主题的变量算出这一扇窗的全套颜色（都带默认值；对比度：数字 ≥ 4.5，旗 / 雷 ≥ 3）
export function mineColors() {
    const root = document.documentElement, cs = getComputedStyle(root);
    const v = n => cs.getPropertyValue(n).trim();
    const tint = toRgb(v('--SmartThemeBlurTintColor'), [38, 38, 43, 1]);
    const body = toRgb(v('--SmartThemeBodyColor'), [232, 232, 238, 1]);
    const base = lum(body) > .4 ? [17, 17, 20] : [255, 255, 255];   // 半透明的底，垫在和字相反的颜色上
    const bg = over(tint, base);
    const dark = lum(bg) < .3;
    const toward = dark ? [255, 255, 255] : [0, 0, 0];
    const fg = ratio(body, bg) >= 7 ? body.slice(0, 3) : ensure(body.slice(0, 3), [bg], 7, toward);
    const closed = mix(bg, fg, dark ? .2 : .16);
    const open = mix(bg, fg, dark ? .05 : .045);
    const bdRaw = toRgb(v('--SmartThemeBorderColor'), mix(bg, fg, .35));
    const bd = ensure(over(bdRaw, bg), [bg], 1.7, toward);
    const dim = ensure(mix(bg, fg, .72), [bg, closed], 4.5, toward);
    const flag = ensure(hex(dark ? '#ff7b7b' : '#c62828'), [closed], 4.5, toward);
    const boom = dark ? hex('#7a2a2a') : hex('#e57373');
    const nums = (dark ? NUM_DARK : NUM_LIGHT).map(h => ensure(hex(h), [open], 4.5, toward));
    return {
        '--msw-bg': css(bg), '--msw-fg': css(fg), '--msw-bd': css(bd), '--msw-closed': css(closed), '--msw-open': css(open),
        '--msw-hover': css(mix(bg, fg, .2)), '--msw-dim': css(dim), '--msw-flag': css(flag), '--msw-mine': css(fg), '--msw-boom': css(boom),
        '--msw-boomfg': css(ensure(fg, [boom], 4.5, dark ? [255, 255, 255] : [0, 0, 0])),
        ...Object.fromEntries(nums.map((c, k) => [`--msw-n${k + 1}`, css(c)])),
    };
}

export default function mount(api = {}) {
    const root = document.documentElement;
    const style = document.createElement('style');
    style.id = 'msw-style';
    style.textContent = CSS;
    document.head.append(style);

    let win = null, game = null, unbind = null, obs = null, pending = 0;
    const cells = [];
    const $ = s => win.querySelector(s);
    const isMobile = () => matchMedia('(max-width: 1000px)').matches;
    const getLevel = () => { const l = api.get?.('level'); return LEVELS[l] ? l : 'beginner'; };
    const reads = () => {
        try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch { return null; }
    };

    const paint = () => {
        if (!win) return;
        const c = mineColors();
        for (const [k, v] of Object.entries(c)) win.style.setProperty(k, v);
    };
    const place = (x, y) => {
        const r = win.getBoundingClientRect();
        x = Math.max(8, Math.min(innerWidth - Math.min(r.width, innerWidth) - 8, x));
        y = Math.max(8, Math.min(innerHeight - 60, y));
        win.style.left = x + 'px';
        win.style.top = y + 'px';
        return { x, y };
    };

    function endText(kind) {
        const f = $('.msw-foot');
        if (kind === 'win') f.innerHTML = `<b>扫完了！</b>用时 ${game.state.time} 秒`;
        else if (kind === 'lose') f.innerHTML = '<b>踩到雷了。</b>点「重开」再来';
        else f.textContent = isMobile() ? '点一下翻开 · 长按插旗 · 点数字翻一圈' : '左键翻开 · 右键插旗 · 点数字翻一圈 · F2 重开';
    }

    const view = {
        reset(L, level) {
            win.style.setProperty('--cols', L.cols);
            win.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('on', b.dataset.level === level));
            const grid = $('.msw-grid');
            grid.innerHTML = '';
            cells.length = 0;
            for (let i = 0; i < L.cols * L.rows; i++) {
                const d = document.createElement('div');
                d.className = 'msw-cell';
                d.dataset.i = i;
                cells.push(d);
            }
            grid.append(...cells);
            endText();
            requestAnimationFrame(() => { if (win && !isMobile()) place(parseFloat(win.style.left) || 0, parseFloat(win.style.top) || 0); });
        },
        open(i, n) { cells[i].classList.add('open'); if (n) cells[i].dataset.n = n; },
        flag(i, on) { cells[i].classList.toggle('flag', on); },
        mine(i) { cells[i].classList.add('open', 'mine'); },
        wrong(i) { cells[i].classList.add('open', 'wrong'); },
        boom(i) { cells[i].classList.add('boom'); },
        led(which, v) {
            const s = v < 0 ? '-' + String(Math.min(99, -v)).padStart(2, '0') : String(Math.min(999, v)).padStart(3, '0');
            $(`[data-led="${which}"] b`).textContent = s;
        },
        face(name) { const f = $('.msw-face'); if (f) f.dataset.face = name; },
        end: endText,
    };

    function close() {
        game?.stop();
        unbind?.();
        obs?.disconnect();
        cancelAnimationFrame(pending);
        win?.remove();
        win = game = unbind = obs = null;
    }

    function open() {
        if (win) { win.focus({ preventScroll: true }); return; }
        win = document.createElement('div');
        win.id = 'msw';
        win.tabIndex = -1;
        win.style.setProperty('--msw-i-flag', FLAG_SVG);
        win.style.setProperty('--msw-i-mine', MINE_SVG);
        win.innerHTML = `
            <div class="msw-head"><span class="msw-title">扫雷</span>
                ${Object.entries(LEVELS).map(([k, v]) => `<button type="button" data-level="${k}">${v.label}</button>`).join('')}
                <button type="button" class="msw-x" title="关闭（Esc）" aria-label="关闭">×</button></div>
            <div class="msw-bar"><span class="msw-num" data-led="mines"><small>剩余雷</small><b>000</b></span>
                <button type="button" class="msw-face" title="重开（F2）">重开</button>
                <span class="msw-num" data-led="time"><small>用时</small><b>000</b></span></div>
            <div class="msw-body"><div class="msw-grid"></div></div>
            <div class="msw-foot" aria-live="polite"></div>`;
        document.body.append(win);
        paint();
        game = createGame(view);
        unbind = bindGrid($('.msw-grid'), game, { cellSel: '.msw-cell', face: view.face });
        $('.msw-x').addEventListener('click', close);
        $('.msw-face').addEventListener('click', () => game.newGame(getLevel()));
        win.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => { api.set?.('level', b.dataset.level); game.newGame(b.dataset.level); }));
        win.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
            else if (e.key === 'F2') { e.preventDefault(); game.newGame(getLevel()); }
        });
        // 拖标题栏挪窗口（电脑）。拖的时候只改 transform，每帧最多一次；松手再写回 left/top 并记住
        const head = $('.msw-head');
        head.addEventListener('pointerdown', e => {
            if (e.target.closest('button') || isMobile() || e.button) return;
            const r = win.getBoundingClientRect();
            const sx = e.clientX, sy = e.clientY;
            let x = r.left, y = r.top, frame = 0;
            head.setPointerCapture(e.pointerId);
            win.classList.add('dragging');
            const move = ev => {
                x = Math.max(8, Math.min(innerWidth - r.width - 8, r.left + ev.clientX - sx));
                y = Math.max(8, Math.min(innerHeight - 60, r.top + ev.clientY - sy));
                frame ||= requestAnimationFrame(() => { frame = 0; win.style.transform = `translate(${x - r.left}px, ${y - r.top}px)`; });
            };
            const up = () => {
                cancelAnimationFrame(frame);
                head.removeEventListener('pointermove', move);
                head.removeEventListener('pointerup', up);
                head.removeEventListener('pointercancel', up);
                win.classList.remove('dragging');
                win.style.transform = '';
                const p = place(x, y);
                try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* 记不住就算了 */ }
            };
            head.addEventListener('pointermove', move);
            head.addEventListener('pointerup', up);
            head.addEventListener('pointercancel', up);
        });
        // 开着的时候换了昼夜 / 主题，颜色跟着重算（每帧最多一次）
        obs = new MutationObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(paint); });
        obs.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });

        const saved = reads();
        win.style.left = '0px'; win.style.top = '0px';
        game.newGame(getLevel());
        requestAnimationFrame(() => {
            if (!win || isMobile()) return;
            const r = win.getBoundingClientRect();
            place(saved ? saved.x : innerWidth - r.width - 72, saved ? saved.y : 96);
        });
        win.focus({ preventScroll: true });
    }

    // 入口 1：魔杖菜单
    const item = document.createElement('div');
    item.id = 'msw_menu';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.title = '扫雷';
    item.innerHTML = '<div class="fa-solid fa-bomb extensionsMenuExtensionButton"></div><span>扫雷</span>';
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    document.getElementById('extensionsMenu')?.append(item);
    // 入口 2：斜杠命令 /minesweeper（别名 /mine）
    let parser = null;
    try {
        const { SlashCommandParser, SlashCommand } = SillyTavern.getContext();
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'minesweeper', aliases: ['mine'],
            callback: () => { open(); return ''; },
            helpString: '打开扫雷小窗（主题伴侣的小部件）',
        }));
        parser = SlashCommandParser;
    } catch (e) { console.warn('[主题伴侣] 扫雷：斜杠命令注册失败', e); }

    return () => {
        close();
        item.remove();
        if (parser) { delete parser.commands.minesweeper; delete parser.commands.mine; }
        style.remove();
    };
}
