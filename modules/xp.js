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
const { LEVELS, xpMineWindow } = await import(new URL(`../widgets/minesweeper.js${new URL(import.meta.url).search}`, import.meta.url).href);

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

    // 游戏窗口（窗口本体、菜单、拖动、格子操作都在 widgets/minesweeper.js 的 xpMineWindow，外观 CSS 在 widgets/mine-xp.css，客串的「XP 经典」样子用的是同一份）
    let win = null;
    let level = 'beginner';
    try { if (LEVELS[localStorage.getItem(LS_KEY)]) level = localStorage.getItem(LS_KEY); } catch { /* 没有存储就用初级 */ }

    function open() {
        if (win) { win.el.hidden = false; return; }
        win = xpMineWindow({
            getLevel: () => level,
            setLevel: (l) => { level = l; try { localStorage.setItem(LS_KEY, l); } catch { /* 忽略 */ } },
            onClose: () => { win = null; },
        });
    }

    function close() { win?.close(); }

    return () => {
        close();
        panelObs.disconnect();
        icon.remove();
        allProg.remove();
        progMenu.remove();
    };
}
