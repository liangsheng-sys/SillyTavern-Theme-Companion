/*
 * 正在播放的小脚本：主题伴侣在用这套主题时载入，换走主题时清理
 * 样子全在主题 CSS 里，这里只负责：
 * 1. 取色：读当前角色的头像，挑一个主色写进 <html> 的 --np-art（保证上面的白字对比度够）
 * 2. 专辑头（#np_hero）、滚动后的细栏（#np_top）：封面、「角色」、大名字、几条消息
 * 3. 播放条：左边正在播放（#np_now），右边加 重新生成 / 上一版 / 下一版（点的是酒馆自己的按钮）
 * 4. 播放条实际多高写进 --np-bar，聊天面板和酒馆的左右面板跟着让位
 * 左右两栏用酒馆自己的面板（左 = AI 设置，右 = 角色），样子在 CSS 里
 */
export default function nowplaying() {
    const st = SillyTavern.getContext();
    const root = document.documentElement;
    const chatEl = document.getElementById('chat');
    const sheld = document.getElementById('sheld');
    const form = document.getElementById('form_sheld');
    const rightForm = document.getElementById('rightSendForm');
    const items = document.getElementById('nonQRFormItems');
    if (!chatEl || !sheld || !form || !rightForm || !items) return null;

    root.classList.add('np-js');
    const made = [];
    const mk = (tag, props = {}, parent) => {
        const el = Object.assign(document.createElement(tag), props);
        if (parent) { parent.append(el); made.push(el); }
        return el;
    };

    // ---------- 界面 ----------
    const hero = mk('div', { id: 'np_hero' });
    hero.innerHTML = '<img class="np-cover" alt=""><div class="np-info"><div class="np-kicker">角色</div><div class="np-title"></div><div class="np-meta"></div></div>';
    const actions = mk('div', { id: 'np_actions' });
    actions.innerHTML = '<div class="np-play" title="继续写"><i class="fa-solid fa-play"></i></div><span class="np-hint">继续写</span>';
    made.push(hero, actions);

    const top = mk('div', { id: 'np_top' }, sheld);
    top.innerHTML = '<div class="np-play" title="继续写"><i class="fa-solid fa-play"></i></div><span class="np-top-name"></span>';

    const now = mk('div', { id: 'np_now' });
    items.prepend(now);
    made.push(now);

    const ctl = (id, icon, title, run) => {
        const el = mk('div', { id, className: `np-ctl fa-solid ${icon} interactable`, title, tabIndex: 0 }, rightForm);
        el.addEventListener('click', run);
        return el;
    };
    const lastSwipe = dir => document.querySelector(`#chat .last_mes .swipe_${dir}`);
    const regen = ctl('np_regen', 'fa-rotate-right', '重新生成', () => document.getElementById('option_regenerate')?.click());
    const prev = ctl('np_prev', 'fa-backward-step', '上一版回复', () => lastSwipe('left')?.click());
    const next = ctl('np_next', 'fa-forward-step', '下一版回复（没有就再写一版）', () => lastSwipe('right')?.click());

    const cont = () => document.getElementById('option_continue')?.click();
    actions.querySelector('.np-play').addEventListener('click', cont);
    top.querySelector('.np-play').addEventListener('click', cont);

    // ---------- 数据 ----------
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const avatarUrl = file => file ? `/characters/${encodeURIComponent(file)}` : '';
    const thumbUrl = file => file ? st.getThumbnailUrl('avatar', file) : '';

    function current() {
        const c = SillyTavern.getContext();
        if (c.groupId) {
            const g = c.groups.find(x => x.id === c.groupId);
            const first = c.characters.find(ch => g?.members?.includes(ch.avatar));
            return { name: g?.name || '群聊', kind: '群聊', avatar: first?.avatar, };
        }
        const ch = c.characters[c.characterId];
        if (!ch) return null;
        return { name: ch.name, kind: '角色', avatar: ch.avatar };
    }


    // ---------- 取色 ----------
    const colorCache = new Map();
    function pickColor(file) {
        if (!file) return Promise.resolve(null);
        if (colorCache.has(file)) return colorCache.get(file);
        const p = new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                try { resolve(dominant(img)); } catch { resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = thumbUrl(file);
        });
        colorCache.set(file, p);
        return p;
    }

    let artFile;
    async function paintArt(file) {
        artFile = file;
        const c = await pickColor(file);
        if (artFile !== file) return;
        if (c) root.style.setProperty('--np-art', c);
        else root.style.removeProperty('--np-art');
    }

    // ---------- 画 ----------
    function renderHero() {
        const cur = current();
        if (!cur) {
            hero.remove();
            actions.remove();
            return;
        }
        const c = SillyTavern.getContext();
        const n = c.chat?.length || 0;
        const words = (c.chat || []).reduce((s, m) => s + (m.mes?.length || 0), 0);
        hero.querySelector('.np-cover').src = avatarUrl(cur.avatar);
        hero.querySelector('.np-kicker').textContent = cur.kind;
        hero.querySelector('.np-title').textContent = cur.name;
        hero.querySelector('.np-meta').innerHTML = `<b>${esc(c.name1)}</b> · ${n} 条消息 · 约 ${words.toLocaleString()} 字`;
        top.querySelector('.np-top-name').textContent = cur.name;
        root.style.setProperty('--np-name', JSON.stringify(cur.name));
        // 专辑头永远是聊天的第一块（「加载更多」按钮也挪到它后面）
        if (chatEl.firstElementChild !== hero) chatEl.prepend(hero);
        if (hero.nextElementSibling !== actions) hero.after(actions);
    }

    function renderNow() {
        const cur = current();
        const c = SillyTavern.getContext();
        const last = [...(c.chat || [])].reverse().find(m => !m.is_user && !m.is_system);
        const total = last?.swipes?.length || 1;
        const at = (last?.swipe_id ?? 0) + 1;
        now.innerHTML = cur
            ? `<img src="${esc(thumbUrl(cur.avatar))}" alt=""><div style="min-width:0"><div class="np-n">${esc(cur.name)}</div><div class="np-s">${total > 1 ? `第 ${at} / ${total} 版回复` : '正在播放'}</div></div>`
            : '';
        const lastMes = document.querySelector('#chat .last_mes');
        const canSwipe = lastMes?.getAttribute('is_user') === 'false';
        prev.classList.toggle('np-off', !canSwipe || at <= 1);
        next.classList.toggle('np-off', !canSwipe);
        regen.classList.toggle('np-off', !c.chat?.length);
    }



    // 角色面板列表里，正在聊的那个标出来（酒馆每次打开面板都重画列表）
    const charList = document.getElementById('rm_print_characters_block');
    function markCur() {
        if (!charList) return;
        const c = SillyTavern.getContext();
        const want = c.groupId ? null : String(c.characterId);
        charList.querySelectorAll('.np-cur').forEach(el => { if (el.dataset.chid !== want) el.classList.remove('np-cur'); });
        if (want != null) charList.querySelector(`.character_select[data-chid="${want}"]`)?.classList.add('np-cur');
    }

    function renderAll() {
        const cur = current();
        paintArt(cur?.avatar);
        renderHero();
        renderNow();
        markCur();
    }


    // ---------- 跟着酒馆 ----------
    const { eventSource, eventTypes: T } = st;
    const soon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(renderAll, 60); }; })();
    const light = () => { renderNow(); renderHero(); };
    const subs = [
        [T.CHAT_CHANGED, soon],
        [T.CHARACTER_EDITED, soon],
        [T.MESSAGE_SWIPED, light],
        [T.MESSAGE_RECEIVED, light],
        [T.MESSAGE_SENT, light],
        [T.MESSAGE_DELETED, light],
        [T.GENERATION_ENDED, light],
        [T.CHARACTER_MESSAGE_RENDERED, light],
        [T.MORE_MESSAGES_LOADED, renderHero],
    ].filter(([ev]) => ev);
    subs.forEach(([ev, fn]) => eventSource.on(ev, fn));

    // 酒馆换聊天时会清空 #chat，专辑头被删了就放回去
    const mo = new MutationObserver(() => {
        if (current() && chatEl.firstElementChild !== hero) renderHero();
    });
    mo.observe(chatEl, { childList: true });
    const moList = new MutationObserver(markCur);
    if (charList) moList.observe(charList, { childList: true });

    // 专辑头滚出去以后，顶上显示细栏
    const onScroll = () => root.classList.toggle('np-scrolled', hero.isConnected && chatEl.scrollTop > hero.offsetHeight - 40);
    chatEl.addEventListener('scroll', onScroll, { passive: true });

    // 播放条实际多高
    const ro = new ResizeObserver(() => root.style.setProperty('--np-bar', `${Math.ceil(form.getBoundingClientRect().height)}px`));
    ro.observe(form);

    renderAll();
    onScroll();

    return () => {
        subs.forEach(([ev, fn]) => eventSource.removeListener(ev, fn));
        mo.disconnect();
        moList.disconnect();
        charList?.querySelectorAll('.np-cur').forEach(el => el.classList.remove('np-cur'));
        ro.disconnect();
        chatEl.removeEventListener('scroll', onScroll);
        made.forEach(el => el.remove());
        root.classList.remove('np-js', 'np-scrolled');
        root.style.removeProperty('--np-art');
        root.style.removeProperty('--np-bar');
        root.style.removeProperty('--np-name');
    };
}

// ---------- 从头像里挑主色 ----------
// 按色相分 24 格，越鲜艳、越不黑不白的像素分量越重；挑最重的一格取平均色。
// 几乎没有彩色（黑白头像）就用整体平均色。最后压暗到白字对比度 ≥ 4.5。
function dominant(img) {
    const S = 48;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const r0 = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - r0) / 2, 0, r0, r0, 0, 0, S, S);
    const px = g.getImageData(0, 0, S, S).data;
    const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    let ar = 0, ag = 0, ab = 0, an = 0;
    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        ar += r; ag += gg; ab += b; an++;
        const [h, s, l] = hsl(r, gg, b);
        const w = s * s * Math.max(0, 1 - Math.abs(l - .5) * 1.8);
        if (w <= 0) continue;
        const bin = bins[Math.floor(h * 24) % 24];
        bin.w += w; bin.r += r * w; bin.g += gg * w; bin.b += b * w;
    }
    if (!an) return null;
    const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
    const vivid = best.w > an * 0.005;
    const rgb = vivid ? [best.r / best.w, best.g / best.w, best.b / best.w] : [ar / an, ag / an, ab / an];
    let [h, s, l] = hsl(...rgb);
    // 压暗时饱和度也跟着掉，彩色头像先把饱和度托住，免得发灰
    s = vivid ? Math.min(Math.max(s, .45), .72) : Math.min(s, .2);
    l = Math.min(l, .5);
    // 压暗到白字够看（对比度 ≥ 4.5，再多留一点余量给渐变的亮处）
    let out = fromHsl(h, s, l);
    while (contrastWhite(out) < 5 && l > .05) {
        l -= .02;
        out = fromHsl(h, s, l);
    }
    return `rgb(${out.map(Math.round).join(' ')})`;
}

function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
}

function fromHsl(h, s, l) {
    const f = n => {
        const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
        return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4)];
}

function contrastWhite(rgb) {
    const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
    const L = .2126 * lin(rgb[0]) + .7152 * lin(rgb[1]) + .0722 * lin(rgb[2]);
    return 1.05 / (L + .05);
}
