// 絮语 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 挂上「只缩中文」的字体别名（fonts-alias.css，三百多 KB 的 @font-face，放进主题 CSS 太占地方）。
// 2. 欢迎页的默认照片：主题 CSS 找不到扩展的地址，这里写一条 :root { --xy-photo }；
//    主题设置里换照片用的是 html:root:root（优先级更高），会盖过这条。
// 3. 群聊每人一种颜色：按群成员顺序，第一个角色用「角色的颜色」，其余轮流用别的预置颜色。
//    规则包在 @container style(--xy-group-colors: 1) 里，主题设置的开关是改这个变量，切换马上生效。
// 4. 字幕条（q）两边挨着字时加类名，CSS 里空出一点（挨着标点就不用，标点自带空白）。
// 没装扩展时这些都没有：大字里的中文按原大小显示，欢迎页是一张深绿卡片，群聊大家同一种颜色，字幕条两边不留空。

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

    // 字幕条（q）两边：挨着字就加 xy-q-l / xy-q-r（CSS 里空出一点），挨着标点、空格、段首段尾不加
    const PUNCT = /[\s，。、；：？！…—～·「」『』（）《》〈〉【】〔〕“”‘’＂＇,.;:?!()[\]"'\-–]/;
    const edge = (q, back) => {
        for (let n = back ? q.previousSibling : q.nextSibling; n; n = back ? n.previousSibling : n.nextSibling) {
            const t = n.textContent;
            if (t) return back ? t[t.length - 1] : t[0];
        }
        return '';
    };
    const markQ = (scope) => {
        for (const q of scope.querySelectorAll('.mes_text q')) {
            const l = edge(q, true), r = edge(q, false);
            q.classList.toggle('xy-q-l', !!l && !PUNCT.test(l));
            q.classList.toggle('xy-q-r', !!r && !PUNCT.test(r));
        }
    };
    const chat = document.getElementById('chat');
    let qFrame = 0;
    const qWatch = new MutationObserver(() => {
        if (qFrame) return;
        qFrame = requestAnimationFrame(() => { qFrame = 0; markQ(chat); });
    });
    if (chat) {
        markQ(chat);
        qWatch.observe(chat, { childList: true, subtree: true, characterData: true });
    }

    const events = st?.eventSource && st.eventTypes
        ? [st.eventTypes.CHAT_CHANGED, st.eventTypes.GROUP_UPDATED].filter(Boolean)
        : [];
    for (const e of events) st.eventSource.on(e, paintGroup);
    paintGroup();

    return () => {
        for (const e of events) st.eventSource.removeListener(e, paintGroup);
        qWatch.disconnect();
        if (qFrame) cancelAnimationFrame(qFrame);
        chat?.querySelectorAll('q.xy-q-l, q.xy-q-r').forEach(q => q.classList.remove('xy-q-l', 'xy-q-r'));
        link.remove();
        photo.remove();
        group.remove();
    };
}
