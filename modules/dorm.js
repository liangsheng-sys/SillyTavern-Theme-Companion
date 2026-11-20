// 402 宿舍 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 顶栏最前面多一个「房间」按钮：点了以后信笺收下去，整间宿舍浮在深色方格底上（放大 2 倍），房间里的东西就是菜单：
//    鼠标移到东西上冒一圈描边和小标签，点一下打开酒馆对应的面板（衣柜 = 角色列表，插线板 = 预设……见 SPOTS）。
// 2. 没打开任何聊天时（欢迎页）自动进房间。
// 3. 房间右下角露出一张信笺：上次聊到哪，点它回到聊天。
// 房间图用主题 CSS 里的 --dm-room（主题设置里换男生 / 女生宿舍时跟着变），坐标都按原图 448×336 的 1 倍像素写。
// 没装扩展就没有这些（只有聊天时压暗的房间背景）。

const W = 448, H = 336;
// [名字, 打开什么, 点了做什么（顶栏按钮的选择器，或 'back'）, 多边形]
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SPOTS = [
    ['床帘', '回到聊天', 'back', [[68, 62], [193, 10], [240, 32], [245, 107], [157, 133], [72, 112]]],
    ['衣柜', '角色列表', '#rightNavDrawerIcon', [[309, 118], [330, 108], [388, 123], [391, 128], [391, 241], [363, 255], [309, 226]]],
    ['柜顶的纸箱', '扩展', '#extensions-settings-button .drawer-icon', [[315, 99], [328, 91], [341, 91], [366, 101], [388, 113], [386, 128], [360, 137], [318, 122]]],
    ['窗户', '背景', '#backgrounds-button .drawer-icon', [[262, 45], [318, 73], [318, 160], [262, 132]]],
    ['暖水瓶', '高级格式', '#advanced-formatting-button .drawer-icon', rect(284, 240, 309, 282)],
    ['照片和便签', '世界书', '#WIDrawerIcon', rect(174, 128, 210, 168)],
    ['显示器', 'API 连接', '#sys-settings-button .drawer-icon', rect(147, 154, 181, 184)],
    ['台灯', '用户设置', '#user-settings-button .drawer-icon', rect(90, 160, 110, 212)],
    ['镜子', '用户人设', '#persona-management-button .drawer-icon', rect(123, 160, 139, 190)],
    ['插线板', '预设', '#leftNavDrawerIcon', [[150, 222], [162, 215], [178, 222], [178, 229], [166, 235], [150, 228]]],
];
// 男生宿舍：桌上没有镜子，人设换成挂在梯子上的书包；墙上是海报
const BOY = {
    镜子: ['书包', '用户人设', '#persona-management-button .drawer-icon', rect(234, 170, 266, 210)],
    照片和便签: ['海报', '世界书', '#WIDrawerIcon', rect(176, 128, 198, 168)],
};

const CSS = `
html.dm-room #sheld { transform: translateY(calc(100% + 60px)); }
#sheld { transition: transform .45s cubic-bezier(.3,.7,.3,1); }
html.dm-room body::before, html.dm-room body::after { display: none; }
#dm-room { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; z-index: 2900; background: var(--dm-tiles), var(--dm-void); display: none; overflow: hidden; }
html.dm-room #dm-room { display: block; animation: dm-in .35s ease both; }
@keyframes dm-in { from { opacity: 0; } to { opacity: 1; } }
#dm-room .dm-scroll { position: absolute; inset: 0; overflow: auto hidden; scrollbar-width: none; display: grid; place-items: center; }
#dm-room .dm-scroll::-webkit-scrollbar { display: none; }
#dm-room .dm-box { position: relative; width: calc(${W}px * var(--dm-k)); height: calc(${H}px * var(--dm-k)); background: var(--dm-room) 0 0 / 100% 100% no-repeat; image-rendering: pixelated; flex: none; margin-top: 24px; }
html.dm-room #dm-room .dm-box { animation: dm-zoom .45s cubic-bezier(.3,.7,.3,1) both; }
@keyframes dm-zoom { from { transform: scale(1.5); } to { transform: none; } }
#dm-room svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#dm-room polygon { fill: transparent; stroke: transparent; stroke-width: 2; stroke-linejoin: miter; shape-rendering: crispEdges; cursor: pointer; pointer-events: all; }
#dm-room polygon:is(:hover, :focus-visible, .on) { stroke: #fff4c8; outline: none; }
#dm-room .dm-tag { position: absolute; z-index: 2; transform: translate(-50%, calc(-100% - 12px)); background: var(--dm-paper); color: var(--dm-ink); border: 2px solid var(--dm-line); padding: 2px 12px 3px; font-size: 16px; white-space: nowrap; pointer-events: none; box-shadow: 3px 3px 0 rgb(0 0 0 / .25); }
#dm-room .dm-tag small { color: var(--dm-ink2); margin-left: 6px; font-size: 13px; }
#dm-room .dm-tag[hidden] { display: none; }
#dm-room .dm-cap { position: absolute; left: 6%; bottom: -34px; color: var(--dm-hud); font-size: 17px; letter-spacing: .08em; white-space: nowrap; }
#dm-room .dm-peek { position: absolute; left: 56px; bottom: 56px; width: 260px; z-index: 3; cursor: pointer; text-align: left; font: inherit; color: var(--dm-ink);
  background: repeating-linear-gradient(transparent 0 27px, var(--dm-rule) 27px 28px) 0 6px, var(--dm-paper);
  border: 2px solid var(--dm-line); border-top: 10px solid var(--dm-glue-color); padding: 8px 16px 12px; transform: rotate(-4deg); box-shadow: 5px 5px 0 rgb(0 0 0 / .3); transition: transform .2s; }
#dm-room .dm-peek:hover, #dm-room .dm-peek:focus-visible { transform: rotate(-2deg) translateY(-4px); outline: none; }
#dm-room .dm-peek b { display: block; color: var(--dm-red); font-size: 14px; letter-spacing: .3em; text-align: center; line-height: 28px; }
#dm-room .dm-peek span { display: block; line-height: 28px; font-size: 15px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
#dm-room .dm-peek small { color: var(--dm-ink2); font-size: 13px; }
#dm-room .dm-peek[hidden] { display: none; }
#dm-room-btn .drawer-icon.openIcon { color: var(--dm-hud-hi); filter: drop-shadow(0 3px 0 var(--dm-red)); }
#dm-room { --dm-k: 2; }
@media screen and (max-width: 1000px) {
  #dm-room .dm-scroll { display: block; padding-top: 70px; }
  #dm-room .dm-box { margin: 0; }
  #dm-room .dm-peek { left: auto; right: -20px; bottom: 18px; width: 230px; }
  #dm-room .dm-cap { bottom: -30px; left: 20px; font-size: 15px; }
  #dm-room .dm-hint { position: absolute; top: 58px; left: 0; right: 0; text-align: center; color: var(--dm-hud); font-size: 14px; pointer-events: none; }
}
@media screen and (min-width: 1001px) { #dm-room .dm-hint { display: none; } }
@media (prefers-reduced-motion: reduce) { #sheld, html.dm-room #dm-room, html.dm-room #dm-room .dm-box { transition: none; animation: none; } }
`;

export default function dorm(api = {}) {
    const root = document.documentElement;
    const ctx = () => window.SillyTavern?.getContext?.();
    const style = document.createElement('style');
    style.id = 'dm-room-style';
    style.textContent = CSS;
    document.head.append(style);

    // ---- 房间
    const room = document.createElement('div');
    room.id = 'dm-room';
    const svgNS = 'http://www.w3.org/2000/svg';
    room.innerHTML = `<div class="dm-scroll"><div class="dm-box"><svg viewBox="0 0 ${W} ${H}" aria-label="宿舍"></svg><div class="dm-tag" hidden></div><div class="dm-cap"></div></div></div>
<div class="dm-hint">← 左右滑动看看 · 点房间里的东西 →</div>
<button class="dm-peek" type="button" hidden><b></b><small></small><span></span></button>`;
    document.body.append(room);
    const svg = room.querySelector('svg'), tag = room.querySelector('.dm-tag'), box = room.querySelector('.dm-box');
    const peek = room.querySelector('.dm-peek'), cap = room.querySelector('.dm-cap'), scroller = room.querySelector('.dm-scroll');

    const showTag = (p, name, what) => {
        const pts = p.points;
        let minX = W, minY = H, maxX = 0;
        for (const { x, y } of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); }
        tag.innerHTML = `${name}<small>${what}</small>`;
        tag.style.left = `${((minX + maxX) / 2 / W) * 100}%`;
        tag.style.top = `${(minY / H) * 100}%`;
        tag.hidden = false;
    };
    let builtFor = null;
    function buildSpots() {
    const which = api.get?.('room') || 'girl';
    if (builtFor === which) return;
    builtFor = which;
    svg.replaceChildren();
    for (const spot of SPOTS) {
        const [name, what, act, poly] = which === 'boy' && BOY[spot[0]] ? BOY[spot[0]] : spot;
        const p = document.createElementNS(svgNS, 'polygon');
        p.setAttribute('points', poly.map(q => q.join(',')).join(' '));
        p.setAttribute('tabindex', '0');
        p.setAttribute('role', 'button');
        p.setAttribute('aria-label', `${name}：${what}`);
        p.addEventListener('pointerenter', () => showTag(p, name, what));
        p.addEventListener('focus', () => showTag(p, name, what));
        p.addEventListener('pointerleave', () => { tag.hidden = true; });
        p.addEventListener('blur', () => { tag.hidden = true; });
        const go = () => {
            if (act === 'back') return leave();
            const el = document.querySelector(act);
            const toggle = el?.closest('.drawer-toggle') || el;
            toggle?.click();
        };
        p.addEventListener('click', go);
        p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        svg.append(p);
    }
    }

    // ---- 「房间」按钮：顶栏最前面
    const btn = document.createElement('div');
    btn.id = 'dm-room-btn';
    btn.className = 'drawer';
    btn.innerHTML = '<div class="drawer-toggle"><div class="drawer-icon fa-solid fa-cube fa-fw closedIcon interactable" title="房间" tabindex="0" role="button"></div></div>';
    const holder = document.getElementById('top-settings-holder');
    holder?.prepend(btn);
    const icon = btn.querySelector('.drawer-icon');
    const onBtn = e => { e.stopPropagation(); root.classList.contains('dm-room') ? leave() : enter(); };
    icon.addEventListener('click', onBtn);

    const hasChat = () => {
        const c = ctx();
        return !!(c && (c.groupId || (c.characterId !== undefined && c.characterId !== null)));
    };
    function fillPeek() {
        const c = ctx();
        const last = hasChat() ? [...(c.chat || [])].reverse().find(m => !m.is_system && m.mes) : null;
        if (!last) { peek.hidden = true; return; }
        const text = String(last.mes).replace(/```[\s\S]*?```/g, '').split('\n').filter(l => !l.trim().startsWith('|')).join(' ').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
        peek.querySelector('b').textContent = getComputedStyle(root).getPropertyValue('--dm-school').replace(/^["']|["']$/g, '') || '学生用笺';
        peek.querySelector('small').textContent = `${last.name} · 上次聊到`;
        peek.querySelector('span').textContent = text.slice(0, 40);
        peek.hidden = false;
    }
    function enter() {
        buildSpots();
        fillPeek();
        const c = ctx();
        cap.textContent = c?.name2 && hasChat() ? `402 · ${c.name2}` : '402';
        root.classList.add('dm-room');
        icon.classList.replace('closedIcon', 'openIcon');
        // 手机：房间比屏幕宽，先对准书桌
        setTimeout(() => { if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = box.offsetWidth * (40 / W); }, 500);
    }
    function leave() {
        if (!hasChat()) {   // 没有聊天可回：打开角色列表
            const el = document.getElementById('rightNavDrawerIcon');
            el?.closest('.drawer-toggle')?.click();
            return;
        }
        root.classList.remove('dm-room');
        icon.classList.replace('openIcon', 'closedIcon');
        tag.hidden = true;
    }
    peek.addEventListener('click', leave);

    // 换聊天：没有聊天（欢迎页）就进房间，打开了聊天就回到信笺
    const onChat = () => { if (hasChat()) leave(); else enter(); };
    const c0 = ctx();
    const es = c0?.eventSource, ev = c0?.eventTypes || c0?.event_types;
    if (es && ev?.CHAT_CHANGED) es.on(ev.CHAT_CHANGED, onChat);
    if (!hasChat()) enter();

    const onKey = e => { if (e.key === 'Escape' && root.classList.contains('dm-room') && hasChat() && !document.querySelector('.openDrawer')) leave(); };
    document.addEventListener('keydown', onKey);

    return () => {
        if (es && ev?.CHAT_CHANGED) es.removeListener?.(ev.CHAT_CHANGED, onChat);
        document.removeEventListener('keydown', onKey);
        root.classList.remove('dm-room');
        room.remove();
        btn.remove();
        style.remove();
    };
}
