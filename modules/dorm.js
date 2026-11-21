// 402 宿舍 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 顶栏最前面多一个「房间」按钮：点了以后信笺收下去，整间宿舍浮在深色方格底上（放大 2 倍），房间里的东西就是菜单：
//    鼠标移到东西上冒一圈描边和小标签，点一下打开酒馆对应的面板（衣柜 = 角色列表，插线板 = 预设……见 SPOTS）。
// 2. 没打开任何聊天时（欢迎页）自动进房间。
// 3. 房间右下角露出一张信笺：上次聊到哪，点它回到聊天。
// 4. 小熊、暖水瓶可以换样子（主题设置里选；房间里点小熊也换下一只）：在浏览器里把房间图和图集 dorm-things.png 拼起来，
//    写到 html 的 --dm-room 上（聊天时的背景也跟着变）。
// 房间图用主题 CSS 里的 --dm-room（主题设置里换男生 / 女生宿舍时跟着变），坐标都按原图 730×712 的 1 倍像素写（tools/dorm/whitebox/room.py 程序画的白板房间 + 物件）。
// 热区：dorm-spots-<房>.png 每个像素记着它属于第几样东西（tools/dorm/spots.py 生成，顺序和 SPOTS 一样），
//    鼠标指哪个像素就是哪样东西，描边也照它画；多边形只留给键盘（Tab 选中）和热区图没载入时用。
// 5. 昼夜：主题伴侣的昼夜开关切到夜 = 熄灯，房间图换成 dorm-room-<房>-night.png（台灯、小彩灯亮着），图集换 dorm-things-night.png。
// 没装扩展就没有这些（只有聊天时压暗的房间背景，白天那张）。

const W = 730, H = 712;
// [名字, 打开什么, 点了做什么（顶栏按钮的选择器，或 'back'）, 多边形]（外框，room.py 打印出来的）
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SPOTS = [
    ['床帘', '回到聊天', 'back', rect(56, 63, 411, 346)],
    ['衣柜', '角色列表', '#rightNavDrawerIcon', rect(551, 247, 698, 561)],
    ['柜顶的纸箱', '扩展', '#extensions-settings-button .drawer-icon', rect(569, 198, 688, 287)],
    ['窗户', '背景', '#backgrounds-button .drawer-icon', rect(440, 103, 618, 354)],
    ['暖水瓶', '高级格式', '#advanced-formatting-button .drawer-icon', rect(263, 535, 287, 577)],
    ['照片', '世界书', '#WIDrawerIcon', rect(330, 272, 356, 330)],
    ['笔记本电脑', 'API 连接', '#sys-settings-button .drawer-icon', rect(195, 323, 251, 370)],
    ['台灯', '用户设置', '#user-settings-button .drawer-icon', rect(280, 289, 306, 340)],
    ['镜子', '用户人设', '#persona-management-button .drawer-icon', rect(178, 335, 205, 377)],
    ['插线板', '预设', '#leftNavDrawerIcon', rect(213, 429, 258, 454)],
    ['小熊', '换一只', 'bear', rect(314, 168, 342, 207)],
];
// 男生宿舍：桌上没有镜子，人设换成挂在梯子上的书包；高柜门上贴的是课程表
const BOY = {
    镜子: ['书包', '用户人设', '#persona-management-button .drawer-icon', rect(380, 278, 424, 335)],
    照片: ['课程表', '世界书', '#WIDrawerIcon', rect(324, 260, 357, 326)],
};

// 能换样子的东西：图集 dorm-things.png 一行 = 一样东西在一间房里，一格 35×45 = 一个样子（含背景，整块盖上去）；
// dorm-things-spots.png 同样排列的热区。at = 在房间图里的左上角（room.py things 生成 art/things2.json，照抄）
const CELL = [30, 44];
const THINGS = {
    bear: { spot: 11, size: [30, 43], rooms: {girl: {at: [313, 165], row: 0}}, styles: ['0', 'v3', 'v5', 'v7', 'v8', 'v15'] },
    thermos: { spot: 5, size: [26, 44], rooms: {girl: {at: [262, 534], row: 1}, boy: {at: [262, 534], row: 2}}, styles: ['0', 'v2', 'v7', 'v10', 'v11', 'v15'] },
};
const OUTLINE = [255, 244, 200];

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
#dm-room:not(.dm-map) polygon:is(:hover, :focus-visible, .on) { stroke: #fff4c8; }
#dm-room polygon:focus-visible { outline: none; }
#dm-room.dm-map polygon { pointer-events: none; }
#dm-room.dm-map .dm-box { cursor: default; }
#dm-room.dm-map .dm-box.dm-over { cursor: pointer; }
#dm-room .dm-line { position: absolute; image-rendering: pixelated; pointer-events: none; display: none; }
#dm-room .dm-line.on { display: block; }
#dm-room.dm-no-outline polygon { stroke: transparent !important; }
#dm-room.dm-no-outline .dm-line { display: none !important; }
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
#dm-room { --dm-k: 1; }
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

    // 标签：放在东西的正上方（bb 是 1 倍像素的 [左, 上, 右]）
    const showTag = (bb, name, what) => {
        tag.innerHTML = `${name}<small>${what}</small>`;
        tag.style.left = `${((bb[0] + bb[2]) / 2 / W) * 100}%`;
        tag.style.top = `${(bb[1] / H) * 100}%`;
        tag.hidden = false;
        // 别出屏幕：靠边的东西，标签往里挪
        tag.style.marginLeft = '0px';
        const r = tag.getBoundingClientRect();
        if (r.right > innerWidth - 8) tag.style.marginLeft = `${innerWidth - 8 - r.right}px`;
        else if (r.left < 8) tag.style.marginLeft = `${8 - r.left}px`;
    };

    // ---- 热区图、能换样子的东西
    const base = new URL('.', import.meta.url).href;
    const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const pixels = img => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height);
    };
    const assets = {};
    const asset = name => (assets[name] ||= loadImg(`${base}dorm-${name}.png`));
    let map = null, lines = [], bboxes = [], roomURL = null, state = '', builtFor = null;
    let spots = [];   // 下标 = 热区号：{ el, name, what, act, poly }

    function drawLines() {
        lines.forEach(l => l?.remove()); lines = []; bboxes = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const id = map[y * W + x]; if (!id) continue;
            const b = bboxes[id] ||= [x, y, x, y];
            if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
        }
        bboxes.forEach((b, id) => {
            if (!b) return;
            const ox = b[0] - 1, oy = b[1] - 1, cw = b[2] - b[0] + 3, ch = b[3] - b[1] + 3;
            const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.className = 'dm-line';
            const g = c.getContext('2d'), d = g.createImageData(cw, ch);
            const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && map[y * W + x] === id;
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const X = ox + x, Y = oy + y;
                if (at(X, Y) || !(at(X + 1, Y) || at(X - 1, Y) || at(X, Y + 1) || at(X, Y - 1))) continue;
                d.data.set([...OUTLINE, 255], (y * cw + x) * 4);
            }
            g.putImageData(d, 0, 0);
            Object.assign(c.style, { left: `${ox / W * 100}%`, top: `${oy / H * 100}%`, width: `${cw / W * 100}%`, height: `${ch / H * 100}%` });
            box.append(c); lines[id] = c;
        });
    }

    async function refresh() {
        const which = api.get?.('room') === 'boy' ? 'boy' : 'girl';
        const pick = Object.fromEntries(Object.keys(THINGS).map(k => [k, String(api.get?.(k) ?? '0')]));
        const n = root.classList.contains('dn-night') ? '-night' : '';   // 伴侣的昼夜开关：夜 = 熄灯，换夜里那套图
        const key = which + n + JSON.stringify(pick);
        if (key === state) return;
        state = key;
        buildSpots(which);
        try {
            const [spotsImg, thingsImg, thingsSpotsImg] = await Promise.all([asset(`spots-${which}`), asset(`things${n}`), asset('things-spots')]);
            if (state !== key) return;
            const sp = pixels(spotsImg).data, m = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) m[i] = sp[i * 4];
            const active = Object.entries(THINGS).filter(([k, t]) => pick[k] !== '0' && t.rooms[which] !== undefined && t.styles.includes(pick[k]));
            if (active.length) {
                const roomImg = await asset(`room-${which}${n}`);
                const c = document.createElement('canvas'); c.width = W; c.height = H;
                const g = c.getContext('2d'); g.drawImage(roomImg, 0, 0);
                const tp = pixels(thingsSpotsImg);
                for (const [k, t] of active) {
                    const { at: [ox, oy], row } = t.rooms[which], col = t.styles.indexOf(pick[k]), [w, h] = t.size;
                    g.clearRect(ox, oy, w, h);
                    g.drawImage(thingsImg, col * CELL[0], row * CELL[1], w, h, ox, oy, w, h);   // 整块换成这个样子
                    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)                      // 热区也整块换
                        m[(oy + y) * W + ox + x] = tp.data[((row * CELL[1] + y) * tp.width + col * CELL[0] + x) * 4];
                }
                const blob = await new Promise(ok => c.toBlob(ok));
                if (state !== key) return;
                if (roomURL) URL.revokeObjectURL(roomURL);
                roomURL = URL.createObjectURL(blob);
                root.style.setProperty('--dm-room', `url("${roomURL}")`);
            } else {
                if (roomURL) { URL.revokeObjectURL(roomURL); roomURL = null; }
                root.style.setProperty('--dm-room', `url("${base}dorm-room-${which}${n}.png")`);   // 扩展里的原图（主题 CSS 里嵌的是压成 256 色的小图）
            }
            map = m; drawLines(); room.classList.add('dm-map');
        } catch (e) {
            console.warn('[402 宿舍] 热区图没载入，改用多边形', e);
            map = null; room.classList.remove('dm-map');
        }
    }

    let cur = 0;
    const bbOf = id => bboxes[id] || (p => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0]))])(spots[id].poly);
    function light(id) {   // 亮出第 id 样东西（描边 + 标签）；0 = 都不亮
        if (id === cur) return;
        lines[cur]?.classList.remove('on');
        cur = id;
        box.classList.toggle('dm-over', !!id);
        if (!id || !spots[id]) { tag.hidden = true; return; }
        lines[id]?.classList.add('on');
        showTag(bbOf(id), spots[id].name, spots[id].what);
    }
    function activate(id) {
        const s = spots[id]; if (!s) return;
        // 手机（没有鼠标悬停）选了「先亮再开」：第一下只亮出名字
        const touch = !matchMedia('(hover: hover)').matches;
        if (touch && api.get?.('tap') === 'twice' && !s.el.classList.contains('on')) {
            svg.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
            s.el.classList.add('on'); cur = 0; light(id);
            return;
        }
        s.el.classList.remove('on');
        if (s.act === 'back') return leave();
        if (s.act === 'bear') {   // 小熊：换下一只
            const st = THINGS.bear.styles, now = String(api.get?.('bear') ?? '0');
            api.set?.('bear', st[(st.indexOf(now) + 1) % st.length]);
            refresh();
            return;
        }
        const el = document.querySelector(s.act);
        (el?.closest('.drawer-toggle') || el)?.click();
    }
    const idAt = e => {
        const r = box.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
        return map && x >= 0 && y >= 0 && x < W && y < H ? map[y * W + x] : 0;
    };
    box.addEventListener('pointermove', e => { if (map && e.pointerType === 'mouse') light(idAt(e)); });
    box.addEventListener('pointerleave', () => { if (map && !svg.querySelector('.on')) light(0); });
    box.addEventListener('click', e => {
        if (!map) return;
        const id = idAt(e);
        if (id) activate(id);
        else { svg.querySelectorAll('.on').forEach(x => x.classList.remove('on')); light(0); }
    });

    // 自查截图用：第 id 样东西身上靠中间的一个像素，在屏幕上的坐标
    room.dmPoint = id => {
        if (!map) return null;
        const pts = []; for (let i = 0; i < W * H; i++) if (map[i] === id) pts.push(i);
        if (!pts.length) return null;
        const i = pts[pts.length >> 1], r = box.getBoundingClientRect();
        return { x: r.left + ((i % W) + 0.5) / W * r.width, y: r.top + (Math.floor(i / W) + 0.5) / H * r.height };
    };

    function buildSpots(which) {
        if (builtFor === which) return;
        builtFor = which;
        svg.replaceChildren(); spots = [];
        SPOTS.forEach((spot, i) => {
            const id = i + 1;
            const [name, what, act, poly] = which === 'boy' && BOY[spot[0]] ? BOY[spot[0]] : spot;
            if (act === 'bear' && THINGS.bear.rooms[which] === undefined) return;
            const p = document.createElementNS(svgNS, 'polygon');
            p.setAttribute('points', poly.map(q => q.join(',')).join(' '));
            p.setAttribute('tabindex', '0');
            p.setAttribute('role', 'button');
            p.setAttribute('aria-label', `${name}：${what}`);
            spots[id] = { el: p, name, what, act, poly };
            // 热区图没载入时：多边形自己管鼠标
            p.addEventListener('pointerenter', () => { if (!map) showTag(bbOf(id), name, what); });
            p.addEventListener('pointerleave', () => { if (!map && !p.classList.contains('on')) tag.hidden = true; });
            p.addEventListener('click', () => { if (!map) activate(id); });
            p.addEventListener('focus', () => { cur = 0; light(id); });
            p.addEventListener('blur', () => light(0));
            p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(id); } });
            svg.append(p);
        });
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
        refresh();
        room.classList.toggle('dm-no-outline', api.get?.('outline') === 'name');
        svg.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
        light(0);
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
        light(0);
    }
    peek.addEventListener('click', leave);

    // 换聊天：没有聊天（欢迎页）就进房间，打开了聊天就回到信笺
    const onChat = () => { if (hasChat()) leave(); else enter(); };
    const c0 = ctx();
    const es = c0?.eventSource, ev = c0?.eventTypes || c0?.event_types;
    if (es && ev?.CHAT_CHANGED) es.on(ev.CHAT_CHANGED, onChat);
    if (!hasChat()) enter();

    // 主题设置改了（换宿舍、换小熊……）：伴侣不会重新载入脚本，每秒看一眼
    refresh();
    const poll = setInterval(refresh, 1000);
    const dn = new MutationObserver(() => refresh());   // 切昼夜（html 上的 dn-day / dn-night）马上换房间图
    dn.observe(root, { attributes: true, attributeFilter: ['class'] });

    const onKey = e => { if (e.key === 'Escape' && root.classList.contains('dm-room') && hasChat() && !document.querySelector('.openDrawer')) leave(); };
    document.addEventListener('keydown', onKey);

    return () => {
        if (es && ev?.CHAT_CHANGED) es.removeListener?.(ev.CHAT_CHANGED, onChat);
        document.removeEventListener('keydown', onKey);
        clearInterval(poll);
        dn.disconnect();
        root.style.removeProperty('--dm-room');
        if (roomURL) URL.revokeObjectURL(roomURL);
        root.classList.remove('dm-room');
        room.remove();
        btn.remove();
        style.remove();
    };
}
