// 絮语 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 挂上「只缩中文」的字体别名（fonts-alias.css，三百多 KB 的 @font-face，放进主题 CSS 太占地方）。
// 2. 欢迎页的默认照片：主题 CSS 找不到扩展的地址，这里写一条 :root { --xy-photo }；
//    主题设置里换照片用的是 html:root:root（优先级更高），会盖过这条。
// 3. 群聊每人一种颜色：按群成员顺序，第一个角色用「角色的颜色」，其余轮流用别的预置颜色。
//    规则包在 @container style(--xy-group-colors: 1) 里，主题设置的开关是改这个变量，切换马上生效。
// 4. 字幕条（q）：两边挨着字时加类名，CSS 里空出一点（挨着标点就不用，标点自带空白）；
//    条里成段的西文包进 .xy-lat，CSS 里往上挪一点，和中文都在条的正中。
// 5. 正在写回复：酒馆把停止键 #mes_stop 设成 display:flex 时给 body 加 xy-gen（名字上的声波跳起来）。
// 6. 楼层导航：电脑上聊天区右边一根竖轨，橘红药丸停在正在看的那一楼，点一下跳过去（Wispr「Speak naturally」那排选项卡）。
// 没装扩展时这些都没有：大字里的中文按原大小显示，欢迎页是一张深绿卡片，群聊大家同一种颜色，字幕条两边不留空。
//
// 性能：流式输出时酒馆每帧都重写最后一条消息，这里只处理有变动的那几条消息，不再每帧扫整个聊天。

// 预置颜色：底色、压在底上的字、白天的字用色、夜里的字用色（和主题设置里的一致）
const PALETTE = [
    ['#FFA946', '#1A1A1A', '#8A4B00', '#FFA946'],   // 杏黄
    ['#FFBCF2', '#1A1A1A', '#9B2F7F', '#FFBCF2'],   // 粉
    ['#FF6C4C', '#1A1A1A', '#A82C12', '#FF8F73'],   // 橘红
    ['#7F1C34', '#FFFFEB', '#7F1C34', '#F2A7B8'],   // 酒红
    ['#FFFFEB', '#1A1A1A', '#1A1A1A', '#FFFFEB'],   // 奶油
    ['#F0D7FF', '#1A1A1A', '#6E3FA6', '#F0D7FF'],   // 淡紫
];

export default function xuyu() {
    const root = document.documentElement;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'xy-fonts-alias';
    link.href = new URL('xuyu-fonts-alias.css', import.meta.url).href;
    document.head.append(link);

    const photo = document.createElement('style');
    photo.id = 'xy-photo-default';
    photo.textContent = `:root { --xy-photo: url("${new URL('xuyu-photo-118.webp', import.meta.url).href}"); }`;
    document.head.append(photo);

    const group = document.createElement('style');
    group.id = 'xy-group-colors';
    document.head.append(group);

    const st = window.SillyTavern?.getContext?.();
    const norm = c => String(c).trim().toUpperCase();

    function paintGroup() {
        group.textContent = '';
        const c = window.SillyTavern?.getContext?.();
        if (!c?.groupId) return;
        const g = c.groups?.find(x => String(x.id) === String(c.groupId));
        const names = (g?.members || []).map(m => c.characters?.find(ch => ch.avatar === m)?.name).filter(Boolean);
        if (names.length < 2) return;
        // 跳过和「角色的颜色」「你的颜色」相同的预置色，免得撞色
        const cs = getComputedStyle(root);
        const taken = new Set([norm(cs.getPropertyValue('--xy-char-c')), norm(cs.getPropertyValue('--xy-you-c'))]);
        const free = PALETTE.filter(p => !taken.has(norm(p[0])));
        const rules = names.slice(1).map((name, i) => {
            const [bg, ink, tDay, tNight] = free[i % free.length];
            const sel = `#chat .mes[ch_name="${CSS.escape(name)}"]:not([is_user='true'])`;
            return `${sel} { --xy-pc: ${bg}; --xy-pi: ${ink}; --xy-pt: ${tNight}; }\n`
                + `:root.dn-day ${sel} { --xy-pt: ${tDay}; }\n`
                + `@media (prefers-color-scheme: light) { :root:not(.dn-night) ${sel} { --xy-pt: ${tDay}; } }\n`;
        });
        group.textContent = `@container style(--xy-group-colors: 1) {\n${rules.join('')}}\n`;
    }

    // ---------------- 字幕条（q） ----------------
    // 两边挨着字就加 xy-q-l / xy-q-r（CSS 里空出一点），挨着标点、空格、段首段尾不加
    const PUNCT = /[\s，。、；：？！…—～·「」『』（）《》〈〉【】〔〕“”‘’＂＇,.;:?!()[\]"'\-–]/;
    const edge = (q, back) => {
        for (let n = back ? q.previousSibling : q.nextSibling; n; n = back ? n.previousSibling : n.nextSibling) {
            const t = n.textContent;
            if (t) return back ? t[t.length - 1] : t[0];
        }
        return '';
    };
    // 成段的西文 / 数字（中间可以夹空格和西文标点），连同紧挨着的英文引号
    const LATIN = /["']?[A-Za-z0-9][A-Za-z0-9'’".,!?&:;\-\s]*/g;
    const wrapLatin = (q) => {
        const walker = document.createTreeWalker(q, NodeFilter.SHOW_TEXT, {
            acceptNode: n => n.parentElement.closest('.xy-lat, code') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        const nodes = [];
        for (let n; (n = walker.nextNode());) if (/[A-Za-z0-9]/.test(n.data)) nodes.push(n);
        for (const n of nodes) {
            const t = n.data, frag = document.createDocumentFragment();
            let last = 0;
            for (const m of t.matchAll(LATIN)) {
                const run = m[0].replace(/\s+$/, '');
                if (m.index > last) frag.append(t.slice(last, m.index));
                const s = document.createElement('span');
                s.className = 'xy-lat';
                s.textContent = run;
                frag.append(s);
                last = m.index + run.length;
            }
            if (last < t.length) frag.append(t.slice(last));
            n.replaceWith(frag);
        }
    };
    const markQ = (scope) => {
        for (const q of scope.querySelectorAll('.mes_text q')) {
            const l = edge(q, true), r = edge(q, false);
            q.classList.toggle('xy-q-l', !!l && !PUNCT.test(l));
            q.classList.toggle('xy-q-r', !!r && !PUNCT.test(r));
            wrapLatin(q);
        }
    };

    // ---------------- 楼层导航 ----------------
    const chat = document.getElementById('chat');
    const ROWS = 9;
    const nav = document.createElement('nav');
    nav.id = 'xy-floors';
    nav.setAttribute('aria-label', '楼层');
    nav.innerHTML = '<div class="xy-fl-view"><ol class="xy-fl-list"></ol></div><i class="xy-fl-pill"></i>';
    const list = nav.querySelector('ol');
    document.body.append(nav);
    let floors = [], cur = -1, start = 0;

    function buildFloors() {
        floors = chat ? [...chat.querySelectorAll(':scope > .mes')] : [];
        const frag = document.createDocumentFragment();
        floors.forEach((m, i) => {
            const li = document.createElement('li');
            li.dataset.i = i;
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
        if (!floors.length || !chat) return;
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

    // 右边放不下（聊天区太宽、窗口太窄）就不显示
    function placeFloors() {
        const r = document.getElementById('sheld')?.getBoundingClientRect();
        const room = r ? window.innerWidth - r.right : 0;
        nav.classList.toggle('xy-fl-noroom', room < 150);
    }

    nav.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        const m = li && floors[Number(li.dataset.i)];
        if (m) m.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    let scrollFrame = 0;
    const onScroll = () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateFloors(); });
    };
    chat?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', placeFloors);

    // ---------------- 聊天的变动：只处理动到的消息 ----------------
    const dirty = new Set();
    let frame = 0, rebuild = false;
    const flush = () => {
        frame = 0;
        for (const m of dirty) if (m.isConnected) markQ(m);
        dirty.clear();
        if (rebuild) { rebuild = false; buildFloors(); placeFloors(); }
        else updateFloors();
    };
    const watch = new MutationObserver((records) => {
        for (const r of records) {
            if (r.target === chat) {
                rebuild = true;
                for (const a of r.addedNodes) if (a.nodeType === 1 && a.classList.contains('mes')) dirty.add(a);
                continue;
            }
            const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            const m = el?.closest('.mes');
            if (m) dirty.add(m);
        }
        if (!frame) frame = requestAnimationFrame(flush);
    });
    if (chat) {
        markQ(chat);
        watch.observe(chat, { childList: true, subtree: true, characterData: true });
        buildFloors();
        placeFloors();
    }

    // ---------------- 正在写回复 ----------------
    const stop = document.getElementById('mes_stop');
    const syncGen = () => document.body.classList.toggle('xy-gen', !!stop && stop.style.display === 'flex');
    const genWatch = new MutationObserver(syncGen);
    if (stop) { genWatch.observe(stop, { attributes: true, attributeFilter: ['style'] }); syncGen(); }

    const events = st?.eventSource && st.eventTypes
        ? [st.eventTypes.CHAT_CHANGED, st.eventTypes.GROUP_UPDATED].filter(Boolean)
        : [];
    for (const e of events) st.eventSource.on(e, paintGroup);
    paintGroup();

    return () => {
        for (const e of events) st.eventSource.removeListener(e, paintGroup);
        watch.disconnect();
        genWatch.disconnect();
        if (frame) cancelAnimationFrame(frame);
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        chat?.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', placeFloors);
        document.body.classList.remove('xy-gen');
        chat?.querySelectorAll('q.xy-q-l, q.xy-q-r').forEach(q => q.classList.remove('xy-q-l', 'xy-q-r'));
        chat?.querySelectorAll('.xy-lat').forEach(s => { const p = s.parentNode; s.replaceWith(s.textContent); p.normalize(); });
        nav.remove();
        link.remove();
        photo.remove();
        group.remove();
    };
}
