// 顶栏收成小本子（来自 Roomlet · 方寸小屋）：Roomlet 主题脚本（themes/dorm/dorm.js）和主题伴侣的「小部件」共用这一份。
// 酒馆顶栏那一排图标藏起来，换成左上角一本小本子；点开是目录，每一项就是原来顶栏的一个按钮
// （扫描 #top-settings-holder 的直接子元素：.drawer 里的 .drawer-icon，别的扩展加的也在，不管套没套 .drawer-toggle）。
// 有面板开着时，小本子变成叉，点它（或按 Esc）关上面板（顶栏藏起来以后没有别的办法关）。
//
// 用法：mountNotebook(api) → { cleanup, setOn(bool), isOn() }
//   api.guest        真 = 小部件客串（自带配色、字体，见 dorm-skin.js；手机上在顶上留一条放小本子，不压住聊天）
//   api.on           一开始就收起（不写 = 客串时收起；Roomlet 主题由选项 hidebar 决定，dorm.js 每秒调 setOn）
//   api.extraItems() 目录末尾再加几项：[{ name, classes: [图标的 class], open, go }]（Roomlet 加「开灯 / 关灯」）
// 顶栏里带 data-dm-go 的按钮（如房间按钮）不是抽屉：目录里放在最后，点了调它的 dmGo()。
import { skinCss, useFont } from './dorm-skin.js';

const NB_CSS = `
html.dm-nobar #top-bar { display: none !important; }
html.dm-nobar #top-settings-holder { height: 0; pointer-events: none; }
html.dm-nobar #top-settings-holder > :is(.drawer-toggle, .drawer-icon),
html.dm-nobar #top-settings-holder > .drawer > :is(.drawer-toggle, .drawer-icon) { display: none !important; }
html.dm-nobar #top-settings-holder .drawer-content { pointer-events: auto; }
#dm-menu-btn { display: none; position: fixed; z-index: 3100; top: 8px; left: 8px; width: 46px; height: 46px; padding: 0; place-items: center; cursor: pointer; color: var(--dm-ink);
  background: var(--dm-paper); border: 2px solid var(--dm-line); border-top: 8px solid var(--dm-glue-color); box-shadow: 3px 3px 0 rgb(0 0 0 / .3); font: inherit; }
html.dm-nobar #dm-menu-btn { display: grid; }
#dm-menu-btn::before { content: ""; width: 32px; height: 32px; margin-top: -4px; background: currentColor; -webkit-mask: var(--ico-menu) center / 32px 32px no-repeat; mask: var(--ico-menu) center / 32px 32px no-repeat; }
#dm-menu-btn.on::before { -webkit-mask-image: var(--ico-cross); mask-image: var(--ico-cross); color: var(--dm-red); }
#dm-menu-btn:hover, #dm-menu-btn:focus-visible { background: var(--dm-paper-low); outline: none; }
#dm-menu-btn:focus-visible { box-shadow: 0 0 0 3px var(--dm-red); }
#dm-menu { position: fixed; z-index: 3100; left: 10px; top: 62px; width: min(320px, calc(100vw - 20px)); max-height: calc(100dvh - 76px); overflow-y: auto; box-sizing: border-box;
  padding: 6px 18px 18px 40px; color: var(--dm-ink); font-family: var(--dm-font);
  background: radial-gradient(circle at 7px 14px, var(--dm-void) 0 4px, var(--dm-line) 4.5px 6.5px, transparent 7px) 9px 0 / 14px 30px repeat-y local, var(--dm-paper);
  border: 2px solid var(--dm-line); border-top: 22px solid var(--dm-glue-color);
  box-shadow: 0 4px 0 var(--dm-paper-edge), 0 6px 0 var(--dm-line), 8px 12px 0 rgb(0 0 0 / .3); transform-origin: 20px 0; }
#dm-menu[hidden] { display: none; }
#dm-menu:not([hidden]) { animation: dm-drop .2s steps(5) both; }
@keyframes dm-drop { from { opacity: 0; transform: translateY(-10px) scaleY(.92); } to { opacity: 1; transform: none; } }
#dm-menu h4 { margin: 4px 0 2px; text-align: center; color: var(--dm-red); font-size: 13px; letter-spacing: .5em; text-indent: .5em; line-height: 22px; font-weight: 400; }
#dm-menu .dm-mi { display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; margin: 0; padding: 5px 6px 3px; cursor: pointer; text-align: left;
  background: transparent; color: var(--dm-ink); font: inherit; font-size: 18px; line-height: 30px; border: 0; border-bottom: 2px solid color-mix(in srgb, var(--dm-line), transparent 55%); }
#dm-menu .dm-mi:hover, #dm-menu .dm-mi:focus-visible { outline: none; background: color-mix(in srgb, var(--dm-note), var(--dm-paper) 30%); border-bottom-color: var(--dm-red); }
#dm-menu .dm-mi .drawer-icon { flex: none; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; font-size: 22px; color: var(--dm-ink2); opacity: 1; }
#dm-menu .dm-mi .drawer-icon::before { width: 28px !important; height: 28px !important; -webkit-mask-size: 28px 28px !important; mask-size: 28px 28px !important; }
#dm-menu .dm-mi:hover .drawer-icon, #dm-menu .dm-mi:focus-visible .drawer-icon { color: var(--dm-red); }
#dm-menu .dm-mi.here .dm-mi-t::after { content: "·在这里"; color: var(--dm-red); font-size: 13px; margin-left: 6px; }
@media screen and (max-width: 1000px) {
  #dm-menu-btn { top: 6px; left: 6px; width: 42px; height: 42px; }
  #dm-menu { top: 54px; left: 6px; width: min(310px, calc(100vw - 12px)); }
  #dm-menu .dm-mi { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) { #dm-menu { animation: none !important; } }
`;
// Roomlet 主题里：顶栏整条收掉（信笺从最上面开始），面板顶上让出小本子的位置
const THEME_CSS = `
html.dm-nobar { --topBarBlockSize: 0px; }
html.dm-nobar :is(.drawer-content, #left-nav-panel, #right-nav-panel) { padding-top: 58px !important; }
`;
// 客串：电脑上和 Roomlet 一样（聊天栏在中间，左上角本来就空着）；手机上聊天占满整宽，顶上留一条 50px 放小本子，别压住第一条消息
const GUEST_CSS = skinCss(':is(#dm-menu, #dm-menu-btn).dmw') + `
/* 有的主题把顶栏按钮画在 .drawer::after 上（如 XP 的桌面图标），按钮收进小本子后画也要藏起来，不然留下点不动的图标 */
html.dm-nobar #top-settings-holder::before, html.dm-nobar #top-settings-holder > .drawer::after { display: none !important; }
#dm-menu.dmw .dm-mi .drawer-icon { background: none; border: 0; box-shadow: none; filter: none; margin: 0; }
@media screen and (min-width: 1001px) {
  html.dm-nobar { --topBarBlockSize: 0px; }
  html.dm-nobar :is(.drawer-content, #left-nav-panel, #right-nav-panel) { padding-top: 58px !important; }
}
@media screen and (max-width: 1000px) {
  html.dm-nobar { --topBarBlockSize: 50px; }
  #dm-menu-btn.dmw { top: 4px; }
}
`;
const NAMES = { leftNavDrawerIcon: '预设', 'sys-settings-button': 'API 连接', 'advanced-formatting-button': '高级格式', WIDrawerIcon: '世界书', 'user-settings-button': '用户设置', 'backgrounds-button': '背景', 'extensions-settings-button': '扩展', 'persona-management-button': '用户人设', rightNavDrawerIcon: '角色列表' };

export default function mountNotebook(api = {}) {
    const root = document.documentElement;
    const guest = !!api.guest;
    const style = document.createElement('style');
    style.id = 'dm-nb-style';
    style.textContent = NB_CSS + (guest ? GUEST_CSS : THEME_CSS);
    document.head.append(style);
    const dropFont = guest ? useFont() : null;

    const mbtn = document.createElement('button');
    mbtn.id = 'dm-menu-btn'; mbtn.type = 'button'; mbtn.title = '目录'; mbtn.setAttribute('aria-label', '目录'); mbtn.setAttribute('aria-haspopup', 'true'); mbtn.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.id = 'dm-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    if (guest) { mbtn.classList.add('dmw'); menu.classList.add('dmw'); }
    document.body.append(mbtn, menu);
    const holder = () => document.getElementById('top-settings-holder');
    const isOn = () => root.classList.contains('dm-nobar');
    // 钉住的面板（挂锁）是用户要它一直开着的，不算；带 data-dm-go 的按钮（房间）不是面板
    const openDrawers = () => [...holder()?.querySelectorAll('.drawer-icon.openIcon') || []].filter(i => !i.closest('[data-dm-go]') && !i.closest('.drawer')?.querySelector('.drawer-content.pinnedOpen'));
    const menuOpen = () => !menu.hidden;
    function syncMenuBtn() { mbtn.classList.toggle('on', menuOpen() || openDrawers().length > 0); }
    function closeMenu() { menu.hidden = true; mbtn.setAttribute('aria-expanded', 'false'); syncMenuBtn(); }
    function closeDrawers() { openDrawers().forEach(i => (i.closest('.drawer-toggle') || i).click()); }
    function buildMenu() {
        menu.replaceChildren();
        const h = document.createElement('h4'); h.textContent = '目 录'; menu.append(h);
        // 顶栏的直接子元素：.drawer（里面有 .drawer-icon，套不套 .drawer-toggle 都行），或者直接就是一个 .drawer-icon
        const els = [...holder()?.children || []].filter(d => d.matches('.drawer-icon') || (d.matches('.drawer') && d.querySelector('.drawer-icon')));
        const items = els.map(d => {
            const ic = d.matches('.drawer-icon') ? d : d.querySelector('.drawer-icon');
            const id = ic.id || d.id;
            const name = NAMES[id] || ic.getAttribute('title') || ic.getAttribute('aria-label') || id || '按钮';
            return {
                name, last: !!d.dmGo,
                classes: [...ic.classList].filter(c => !/^(closedIcon|openIcon|interactable|drawer-icon)$/.test(c)),
                open: ic.classList.contains('openIcon'),
                go: d.dmGo || (() => (ic.closest('.drawer-toggle') || ic).click()),
            };
        });
        const list = [...items.filter(x => !x.last), ...items.filter(x => x.last), ...(api.extraItems?.() || [])];
        for (const it of list) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'dm-mi' + (it.open ? ' here' : ''); b.setAttribute('role', 'menuitem');
            const i = document.createElement('span'); i.className = ['drawer-icon', ...it.classes].join(' ');
            const t = document.createElement('span'); t.className = 'dm-mi-t'; t.textContent = it.name;
            b.append(i, t);
            b.addEventListener('click', () => { closeMenu(); it.go(); });
            menu.append(b);
        }
    }
    function openMenu() {
        buildMenu();
        menu.hidden = false; mbtn.setAttribute('aria-expanded', 'true'); syncMenuBtn();
    }
    mbtn.addEventListener('click', () => {
        if (menuOpen()) closeMenu();
        else if (openDrawers().length) closeDrawers();   // 有面板开着：这个键就是「关上」
        else openMenu();
    });
    const onDown = e => { if (menuOpen() && !menu.contains(e.target) && !mbtn.contains(e.target)) closeMenu(); };
    document.addEventListener('pointerdown', onDown, true);
    // 面板开合：按钮的样子（本子 / 叉）跟着变（只有收起顶栏时才看得见，没收起就不干活：顶栏里的面板内容多，class 变动频繁）
    const mo = new MutationObserver(() => { if (isOn()) syncMenuBtn(); });
    if (holder()) mo.observe(holder(), { subtree: true, attributes: true, attributeFilter: ['class'] });

    function setOn(on) {
        if (on === isOn()) return;
        root.classList.toggle('dm-nobar', on);
        if (on) syncMenuBtn();
        if (!on && menuOpen()) closeMenu();
    }
    if (api.on ?? guest) setOn(true);

    // Esc：先关目录，再关面板（顶栏收起时没有别的办法关）。捕获阶段先跑，处理了就给事件打个记号，房间那边不再拿这次 Esc 出房间
    const onKey = e => {
        if (e.key !== 'Escape') return;
        if (menuOpen()) { closeMenu(); mbtn.focus(); e.dmHandled = true; return; }
        if (isOn() && openDrawers().length) { closeDrawers(); e.dmHandled = true; }
    };
    document.addEventListener('keydown', onKey, true);

    function cleanup() {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pointerdown', onDown, true);
        mo.disconnect();
        root.classList.remove('dm-nobar');
        mbtn.remove();
        menu.remove();
        style.remove();
        dropFont?.();
    }
    return { cleanup, setOn, isOn };
}
