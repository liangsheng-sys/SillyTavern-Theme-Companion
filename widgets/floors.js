// 楼层导航（来自絮语）：絮语主题脚本（themes/xuyu/xuyu.js）和主题伴侣的「小部件」共用这一份。
// 电脑上聊天区旁边一根细竖轨，一次露 9 层；药丸停在正在看的那一楼，滚动时滑过去，点一层就跳过去。
// 酒馆里被隐藏的楼层（.mes[is_system="true"]）在那一行末尾多一个划掉的小眼睛。手机（≤1000px）上不显示。
//
// 用法：mountFloors(api) → 清理函数
//   api.guest  不写 / true = 客串：自带配色，不靠任何主题的变量（压在用户自己的背景图上也读得出，所以垫一层淡底）；选项从 api.get() 读
//              false = 絮语主题里：颜色用主题的 --xy-* 变量（floors.css 把它们映射到 --xy-fl-*），选项读主题的 CSS 变量，不垫底
// 选项（小部件的 options 和絮语主题设置一一对应）：
//   side   导航放在聊天区的 left / right
//   rail   竖条在文字的 auto（靠着聊天区那一边）/ left / right
//   accent 强调色 orange（橘红）/ theme（跟随主题：--SmartThemeUnderlineColor，主题的「底线文字」色）/ custom（accentColor）
//   eye    隐藏的楼层显示小眼睛
//   tone   （只有客串）文字配色 auto（主题的正文色 + 主题底色）/ light 浅色字 / dark 深色字
// 选项每秒看一眼有没有变（电脑上、页面可见时才看），不用重启。
//
// 性能：不改 <html> 上的自定义属性（变量写在导航自己身上）；聊天区只监听「直接子元素增减」和 is_system 属性，流式输出时不吵。

const ORANGE = '#FF6C4C';
const ROWS = 9;
const EYE = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z'/><circle cx='12' cy='12' r='3'/><path d='M4 4l16 16'/></svg>")`;

const CSS = `
#xy-floors {
    --xy-fl-row: 30px;
    --xy-fl-w: 128px;
    --xy-fl-accent: var(--SmartThemeUnderlineColor, ${ORANGE});
    --xy-fl-eye: ${EYE};
    position: fixed;
    z-index: 29;
    top: var(--xy-fl-cy, 50vh);
    right: calc(100vw - var(--xy-fl-sl, 0px) + var(--xy-fl-off, 28px));
    transform: translateY(-50%);
    box-sizing: border-box;
    width: calc(var(--xy-fl-w) + var(--xy-fl-padx, 0px) * 2);
    height: calc(var(--xy-fl-n, 9) * var(--xy-fl-row) + var(--xy-fl-pad, 0px) * 2);
    padding: var(--xy-fl-pad, 0px) var(--xy-fl-padx, 0px);
    text-align: right;
    font-family: var(--xy-fl-font-l, ui-monospace, 'Cascadia Mono', Consolas, monospace);
    font-size: 11.5px;
    line-height: var(--xy-fl-row);
    color: var(--xy-fl-dim);
}
#xy-floors.xy-fl-r {
    right: auto;
    left: calc(var(--xy-fl-sr, 0px) + var(--xy-fl-off, 28px));
}
#xy-floors.xy-fl-rl { text-align: left; }
#xy-floors.xy-fl-empty,
#xy-floors.xy-fl-noroom { display: none; }
@media screen and (max-width: 1000px) {
    #xy-floors { display: none; }
}

/* 竖轨 */
#xy-floors::before {
    content: '';
    position: absolute;
    right: calc(var(--xy-fl-padx, 0px) + 4px);
    top: var(--xy-fl-pad, 0px);
    bottom: var(--xy-fl-pad, 0px);
    width: 5px;
    border-radius: 999px;
    background: var(--xy-fl-rail);
}
/* 药丸：占满一层的高度（上下各留 1px，相邻两层的药丸几乎挨着） */
#xy-floors .xy-fl-pill {
    position: absolute;
    right: calc(var(--xy-fl-padx, 0px) + 4px);
    top: calc(var(--xy-fl-pad, 0px) + 1px);
    width: 5px;
    height: calc(var(--xy-fl-row) - 2px);
    border-radius: 999px;
    background: var(--xy-fl-accent);
    transform: translateY(calc(var(--xy-fl-pos, 0) * var(--xy-fl-row)));
    transition: transform 0.45s var(--xy-ease, cubic-bezier(0.22, 1, 0.36, 1));
    pointer-events: none;
}
#xy-floors.xy-fl-rl::before,
#xy-floors.xy-fl-rl .xy-fl-pill {
    right: auto;
    left: calc(var(--xy-fl-padx, 0px) + 4px);
}
#xy-floors .xy-fl-view {
    height: 100%;
    overflow: hidden;
    padding-right: 22px;
}
#xy-floors.xy-fl-rl .xy-fl-view {
    padding-right: 0;
    padding-left: 22px;
}
#xy-floors .xy-fl-list {
    margin: 0;
    padding: 0;
    list-style: none;
    transform: translateY(calc(var(--xy-fl-start, 0) * var(--xy-fl-row) * -1));
    transition: transform 0.45s var(--xy-ease, cubic-bezier(0.22, 1, 0.36, 1));
}
#xy-floors li {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    gap: 0.7em;
    height: var(--xy-fl-row);
    overflow: hidden;
    white-space: nowrap;
    color: var(--xy-fl-dim);
    cursor: pointer;
    transition: color 0.3s;
}
#xy-floors.xy-fl-rl li { flex-direction: row; }
#xy-floors li b {
    flex: none;
    font-weight: 700;
    letter-spacing: 0.04em;
}
#xy-floors li span {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--xy-fl-font-n, system-ui, 'Microsoft YaHei', sans-serif);
    font-size: 12px;
    font-weight: 500;
}
#xy-floors li:hover,
#xy-floors li.on { color: var(--xy-fl-text); }
#xy-floors li.on b { color: var(--xy-fl-label, var(--xy-fl-text)); }
/* 隐藏的楼层：行末一个划掉的眼睛（细线，和面板小图标同一套线宽） */
#xy-floors li.xy-fl-hid::after {
    content: '';
    flex: none;
    width: 13px;
    height: 13px;
    background: currentColor;
    -webkit-mask: var(--xy-fl-eye) center / 13px 13px no-repeat;
    mask: var(--xy-fl-eye) center / 13px 13px no-repeat;
}
#xy-floors.xy-fl-noeye li.xy-fl-hid::after { display: none; }
@media (prefers-reduced-motion: reduce) {
    #xy-floors .xy-fl-pill,
    #xy-floors .xy-fl-list { transition: none; }
}
body.reduced-motion #xy-floors .xy-fl-pill,
body.reduced-motion #xy-floors .xy-fl-list { transition: none; }

/* ---- 客串：自带配色，垫一层淡底（压在用户自己的背景图上也读得出） ---- */
#xy-floors.xy-fl-guest {
    --xy-fl-pad: 8px;
    --xy-fl-padx: 10px;
    border-radius: 12px;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
}
/* 自动：主题的正文色 + 主题底色（主题保证这两个对得开） */
#xy-floors.xy-fl-guest.xy-fl-auto {
    --xy-fl-text: var(--SmartThemeBodyColor, #e8e8e8);
    --xy-fl-dim: color-mix(in srgb, var(--SmartThemeBodyColor, #e8e8e8) 80%, transparent);
    --xy-fl-rail: color-mix(in srgb, var(--SmartThemeBodyColor, #e8e8e8) 24%, transparent);
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #222) 72%, transparent);
}
/* 浅色字：深底 72%，不管后面是什么图，字对底都 ≥ 4.5:1 */
#xy-floors.xy-fl-guest.xy-fl-light {
    --xy-fl-text: #F7F7F2;
    --xy-fl-dim: #D9D9D2;
    --xy-fl-rail: rgb(255 255 255 / 0.28);
    background: rgb(20 20 20 / 0.72);
}
/* 深色字：浅底 80% */
#xy-floors.xy-fl-guest.xy-fl-dark {
    --xy-fl-text: #1A1A1A;
    --xy-fl-dim: #3A3A3A;
    --xy-fl-rail: rgb(0 0 0 / 0.2);
    background: rgb(250 250 245 / 0.8);
}
`;

export default function mountFloors(api = {}) {
    const guest = api.guest !== false;
    const root = document.documentElement;
    const chat = document.getElementById('chat');
    const style = document.createElement('style');
    style.id = 'xy-floors-style';
    style.textContent = CSS;
    document.head.append(style);

    const nav = document.createElement('nav');
    nav.id = 'xy-floors';
    nav.setAttribute('aria-label', '楼层');
    nav.innerHTML = '<div class="xy-fl-view"><ol class="xy-fl-list"></ol></div><i class="xy-fl-pill"></i>';
    if (guest) nav.classList.add('xy-fl-guest', 'xy-fl-auto');
    const list = nav.querySelector('ol');
    document.body.append(nav);
    let floors = [], cur = -1, start = 0, jumping = 0, jumpTimer = 0;

    // ---------------- 选项 ----------------
    const readOpts = () => {
        if (guest) {
            const g = k => api.get?.(k);
            return { side: g('side') === 'right' ? 'right' : 'left', rail: g('rail') || 'auto', accent: g('accent') || 'orange', accentC: g('accentColor') || ORANGE, eye: g('eye') !== false, tone: g('tone') || 'auto' };
        }
        const cs = getComputedStyle(root);
        const v = n => cs.getPropertyValue(n).trim();
        return { side: v('--xy-floors-side') === 'right' ? 'right' : 'left', rail: v('--xy-floors-rail') || 'auto', accent: v('--xy-floors-accent') || 'orange', accentC: v('--xy-floors-accent-c') || ORANGE, eye: v('--xy-floors-eye') !== '0', tone: 'auto' };
    };
    let optKey = '';
    let side = 'left';
    function applyOpts() {
        const o = readOpts();
        const key = JSON.stringify(o);
        if (key === optKey) return;
        optKey = key;
        side = o.side;
        const railLeft = o.rail === 'left' || (o.rail !== 'right' && o.side === 'right');
        nav.classList.toggle('xy-fl-r', o.side === 'right');
        nav.classList.toggle('xy-fl-rl', railLeft);
        nav.classList.toggle('xy-fl-noeye', !o.eye);
        if (guest) {
            for (const t of ['auto', 'light', 'dark']) nav.classList.toggle('xy-fl-' + t, o.tone === t || (t === 'auto' && !['light', 'dark'].includes(o.tone)));
        }
        const acc = o.accent === 'orange' ? ORANGE : o.accent === 'custom' ? (/^#[0-9a-f]{3,8}$/i.test(o.accentC) ? o.accentC : ORANGE) : '';
        if (acc) nav.style.setProperty('--xy-fl-accent', acc); else nav.style.removeProperty('--xy-fl-accent');
        placeFloors();
    }

    // ---------------- 楼层 ----------------
    function buildFloors() {
        floors = chat ? [...chat.querySelectorAll(':scope > .mes')] : [];
        const frag = document.createDocumentFragment();
        floors.forEach((m, i) => {
            const li = document.createElement('li');
            li.dataset.i = i;
            if (m.getAttribute('is_system') === 'true') li.className = 'xy-fl-hid';
            const b = document.createElement('b');
            b.textContent = `#${m.getAttribute('mesid')}`;
            const s = document.createElement('span');
            s.textContent = m.getAttribute('ch_name') || '';
            li.append(b, s);
            frag.append(li);
        });
        list.replaceChildren(frag);
        nav.classList.toggle('xy-fl-empty', floors.length < 2);
        nav.style.setProperty('--xy-fl-n', Math.min(ROWS, floors.length));
        cur = -1;
        updateFloors();
    }

    function updateFloors() {
        if (!floors.length || !chat || jumping) return;
        const box = chat.getBoundingClientRect();
        let i;
        if (chat.scrollHeight - chat.scrollTop - chat.clientHeight < 8) i = floors.length - 1;
        else {
            // 看哪一条消息盖住聊天区上方三分之一那条线（二分查找）
            const line = box.top + chat.clientHeight * 0.33;
            let lo = 0, hi = floors.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (floors[mid].getBoundingClientRect().top <= line) lo = mid; else hi = mid - 1;
            }
            i = lo;
        }
        selectFloor(i);
    }

    function selectFloor(i) {
        if (i === cur) return;
        list.children[cur]?.classList.remove('on');
        cur = i;
        list.children[cur]?.classList.add('on');
        // 药丸在窗口里滑；滑到离边一格时整排挪一下，让当前这楼回到中间
        const max = Math.max(0, floors.length - ROWS);
        if (cur < start + 1 || cur > start + ROWS - 2) start = Math.min(max, Math.max(0, cur - (ROWS >> 1)));
        nav.style.setProperty('--xy-fl-start', start);
        nav.style.setProperty('--xy-fl-pos', cur - start);
    }

    // 放在聊天区（#sheld）外面那一侧的空白里，偏向聊天区：离聊天区边缘是空白宽度的三成左右（至少 28px）；一侧放不下（< 170px）就不显示
    function placeFloors() {
        const sheld = document.getElementById('sheld');
        const r = sheld?.getBoundingClientRect();
        if (!r || !r.width) { nav.classList.add('xy-fl-noroom'); return; }
        const space = side === 'right' ? window.innerWidth - r.right : r.left;
        nav.classList.toggle('xy-fl-noroom', space < 170);
        nav.style.setProperty('--xy-fl-sl', r.left + 'px');
        nav.style.setProperty('--xy-fl-sr', (r.right) + 'px');
        nav.style.setProperty('--xy-fl-off', Math.max(28, (space - 128 - (guest ? 20 : 0)) * 0.3) + 'px');
        const c = (chat || sheld).getBoundingClientRect();
        nav.style.setProperty('--xy-fl-cy', (c.top + c.height / 2) + 'px');
    }

    // 跳楼：药丸先过去；远的先瞬间挪到目标前半屏，只平滑滚最后一小段（长聊天一路平滑滚过去会卡）；
    // 滚动途中不再逐帧算「正在看哪一楼」，停下来再对一次
    const endJump = () => {
        if (!jumping) return;
        jumping = 0;
        clearTimeout(jumpTimer);
        chat.removeEventListener('scrollend', endJump);
        updateFloors();
    };
    const onClick = (e) => {
        const li = e.target.closest('li');
        const i = li ? Number(li.dataset.i) : -1;
        const m = floors[i];
        if (!m) return;
        selectFloor(i);
        const target = Math.max(0, chat.scrollTop + m.getBoundingClientRect().top - chat.getBoundingClientRect().top - 8);
        const dist = target - chat.scrollTop;
        const near = chat.clientHeight * 0.6;
        const calm = document.body.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (calm) { chat.scrollTo({ top: target, behavior: 'instant' }); return; }
        if (Math.abs(dist) > near * 2) chat.scrollTo({ top: target - Math.sign(dist) * near, behavior: 'instant' });
        jumping = 1;
        clearTimeout(jumpTimer);
        jumpTimer = setTimeout(endJump, 900);
        chat.addEventListener('scrollend', endJump, { once: true });
        chat.scrollTo({ top: target, behavior: 'smooth' });
    };
    nav.addEventListener('click', onClick);

    let scrollFrame = 0;
    const onScroll = () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateFloors(); });
    };
    chat?.addEventListener('scroll', onScroll, { passive: true });

    // 聊天区增减消息、有消息被隐藏 / 取消隐藏：下一帧重建一次；聊天区或窗口大小变了：重新摆
    let rebuildFrame = 0;
    const onChange = () => {
        if (rebuildFrame) return;
        rebuildFrame = requestAnimationFrame(() => { rebuildFrame = 0; buildFloors(); placeFloors(); });
    };
    // 两个观察者分开：增减消息只看直接子元素（流式输出改的是消息里面，不吵），隐藏状态只看 is_system 这一个属性
    const watch = new MutationObserver(onChange), watchHide = new MutationObserver(onChange);
    if (chat) {
        watch.observe(chat, { childList: true });
        watchHide.observe(chat, { subtree: true, attributes: true, attributeFilter: ['is_system'] });
    }
    let placeFrame = 0;
    const ro = new ResizeObserver(() => {
        if (placeFrame) return;
        placeFrame = requestAnimationFrame(() => { placeFrame = 0; placeFloors(); });
    });
    ro.observe(document.documentElement);
    const sheldEl = document.getElementById('sheld');
    if (sheldEl) ro.observe(sheldEl);
    if (chat) ro.observe(chat);

    applyOpts();
    if (chat) buildFloors();
    placeFloors();
    const poll = setInterval(() => { if (!document.hidden && window.innerWidth > 1000) applyOpts(); }, 1000);

    return () => {
        clearInterval(poll);
        watch.disconnect();
        watchHide.disconnect();
        ro.disconnect();
        if (rebuildFrame) cancelAnimationFrame(rebuildFrame);
        if (placeFrame) cancelAnimationFrame(placeFrame);
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        clearTimeout(jumpTimer);
        chat?.removeEventListener('scrollend', endJump);
        chat?.removeEventListener('scroll', onScroll);
        nav.removeEventListener('click', onClick);
        nav.remove();
        style.remove();
    };
}
