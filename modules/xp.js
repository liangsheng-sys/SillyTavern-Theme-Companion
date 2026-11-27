/*
 * XP Messenger 的小脚本：主题伴侣在用这套主题时载入（themes.json 里的 module），换走主题时清理
 * 样子全在主题 CSS 里（themes/xp/mine.css 等），这里只管时间和游戏逻辑
 *
 * 1. 托盘时钟：每分钟把当前时间（「15:45」）写进 --xp-clock，并给 html 加 .xp-has-clock
 * 0. 状态标记（代替 CSS 里的 :has()，那种写法让手机整页反复重算样式、很卡）：html 加 .xp-js；
 *    最新那条角色消息加 .xp-lastchar；有角色消息时 html 加 .xp-has-char；没连上 API 时 html 加 .xp-nc；
 *    顶栏里别的扩展按钮个数写进 --xp-ext-n
 * 2. 扫雷：电脑桌面上多一个「扫雷」图标；开始菜单「所有程序(P)」里也能打开（手机从这里进）
 *    左键翻开，右键插旗（手机长按），点已翻开的数字 = 周围旗子数对上时翻开一圈；笑脸 = 重开
 *    游戏逻辑和格子上的操作在扩展的 widgets/minesweeper.js（主题伴侣「小部件」扫雷，别的主题客串用的也是同一份），这里只画 XP 风格的窗口、桌面图标和开始菜单入口
 *    逻辑参考 Minesweeper-XP（MIT，Akshay Kalose），画全是重画的
 */
// 载入 widgets 时带上自己的 ?v=版本，主题更新后不吃旧缓存（widgets/ 在扩展里和 modules/ 平级）
const { LEVELS, createGame, bindGrid } = await import(new URL(`../widgets/minesweeper.js${new URL(import.meta.url).search}`, import.meta.url).href);

export default function xp() {
    const off = [marks(), clock(), minesweeper()];
    return () => off.forEach(f => f?.());
}

const BUILTIN = ['user-settings-button', 'WI-SP-button', 'sys-settings-button', 'extensions-settings-button', 'persona-management-button', 'backgrounds-button', 'ai-config-button', 'advanced-formatting-button', 'rightNavHolder'];

function marks() {
    const root = document.documentElement;
    const chat = document.getElementById('chat');
    const holder = document.getElementById('top-settings-holder');
    const form = document.getElementById('send_form');
    let last = null, queued = false;
    const update = () => {
        queued = false;
        const all = chat ? chat.querySelectorAll('.mes[is_user="false"][is_system="false"]') : [];
        const cur = all[all.length - 1] || null;
        if (cur !== last) { last?.classList.remove('xp-lastchar'); cur?.classList.add('xp-lastchar'); last = cur; }
        root.classList.toggle('xp-has-char', !!cur);
        root.classList.toggle('xp-nc', !!form?.classList.contains('no-connection'));
        const n = holder ? [...holder.children].filter(e => e.classList.contains('drawer') && !BUILTIN.includes(e.id)).length : 0;
        root.style.setProperty('--xp-ext-n', String(Math.min(n, 6)));
    };
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    const obs = new MutationObserver(later), obsAttr = new MutationObserver(later);   // 同一个观察者对同一节点再 observe 会覆盖前一次的选项，所以分两个
    // 只看聊天的直接子元素（加删楼层）和 is_system（隐藏楼层），流式加字不会触发
    if (chat) {
        obs.observe(chat, { childList: true });
        obsAttr.observe(chat, { subtree: true, attributeFilter: ['is_system', 'is_user'] });
    }
    if (holder) obs.observe(holder, { childList: true });
    if (form) obs.observe(form, { attributeFilter: ['class'] });
    root.classList.add('xp-js');
    update();
    return () => {
        obs.disconnect(); obsAttr.disconnect();
        last?.classList.remove('xp-lastchar');
        root.classList.remove('xp-js', 'xp-has-char', 'xp-nc');
        root.style.removeProperty('--xp-ext-n');
    };
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
const LABEL = { beginner: '初级(B)', intermediate: '中级(I)', expert: '高级(E)' };
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
    let win = null, game = null, unbind = null;
    const cells = [];
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
                    ${Object.keys(LEVELS).map(k => `<div class="xp-mine-item" data-act="level" data-level="${k}">${LABEL[k]}</div>`).join('')}
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
        game = createGame(view);
        bindWindow();
        game.newGame(level);
    }

    function close() {
        game?.stop();
        unbind?.();
        win?.remove();
        win = game = unbind = null;
    }

    function bindWindow() {
        const $ = (s) => win.querySelector(s);
        $('.xp-mine-close').addEventListener('click', close);
        $('.xp-mine-face').addEventListener('click', () => game.newGame(level));

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
                if (act === 'new') game.newGame(level);
                if (act === 'level') { level = it.dataset.level; try { localStorage.setItem(LS_KEY, level); } catch { /* 忽略 */ } game.newGame(level); }
                if (act === 'close') { close(); return; }
                if (act === 'about') window.toastr?.info('扫雷 —— XP Messenger 附带的小游戏。左键翻开，右键插旗（手机长按），笑脸重新开局。', '关于扫雷');
            }
            if (!e.target.closest('.xp-mine-menu')) hideDrops();
        });
        win.addEventListener('keydown', (e) => { if (e.key === 'F2') { e.preventDefault(); game.newGame(level); } });
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

        // 格子：左键翻开、右键插旗、长按插旗、按住时笑脸变「哦」（操作在 widgets/minesweeper.js）
        unbind = bindGrid($('.xp-mine-grid'), game, { cellSel: '.xp-mine-cell', face: view.face });
    }

    // 游戏逻辑（widgets/minesweeper.js）算好了，这里把结果画成 XP 的格子
    const view = {
        reset(L, lv) {
            win.style.setProperty('--cols', L.cols);
            win.style.setProperty('--rows', L.rows);
            win.dataset.level = lv;
            win.querySelectorAll('[data-level]').forEach(it => it.classList.toggle('checked', it.dataset.level === lv));
            const grid = win.querySelector('.xp-mine-grid');
            grid.innerHTML = Array.from({ length: L.cols * L.rows }, (_, i) => `<div class="xp-mine-cell" data-i="${i}"></div>`).join('');
            cells.length = 0;
            cells.push(...grid.children);
        },
        open(i, n) { cells[i].classList.add('open'); if (n) cells[i].dataset.n = n; },
        flag(i, on) { cells[i].classList.toggle('flag', on); },
        mine(i) { cells[i].classList.add('open', 'mine'); },
        wrong(i) { cells[i].classList.add('open', 'wrong'); },
        boom(i) { cells[i].classList.add('boom'); },
        face(name) { const f = win?.querySelector('.xp-mine-face'); if (f) f.dataset.face = name; },
        led(which, v) {
            const s = v < 0 ? '-' + String(Math.min(99, -v)).padStart(2, '0') : String(Math.min(999, v)).padStart(3, '0');
            win.querySelectorAll(`[data-led="${which}"] i`).forEach((d, k) => { d.dataset.d = s[k] === '-' ? 'm' : s[k]; });
        },
    };

    return () => {
        close();
        panelObs.disconnect();
        icon.remove();
        allProg.remove();
        progMenu.remove();
    };
}
