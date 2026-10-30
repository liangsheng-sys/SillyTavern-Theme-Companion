/*
 * 正在播放的小脚本：主题伴侣在用这套主题时载入，换走主题时清理
 * 样子全在主题 CSS 里，这里只负责：
 * 1. 取色：读当前角色的头像，挑一个主色写进 <html> 的 --np-art（保证上面的白字对比度够）
 * 2. 专辑头（#np_hero）、滚动后的细栏（#np_top）：封面、「角色」、大名字、几条消息
 * 3. 播放条：左边正在播放（#np_now），右边加 重新生成 / 上一版 / 下一版（点的是酒馆自己的按钮）
 * 4. 播放条实际多高写进 --np-bar，聊天面板和酒馆的左右面板跟着让位
 * 5. 右边角色面板：自己的标题栏（#np_rhead）；角色列表每行写「角色 · 几天前」；
 *    单个角色先显示展示页（#np_about：大封面、名字、收藏 / 编辑 / ⋯），点「编辑」才露出酒馆的编辑表单；
 *    ⋯ 菜单（#np_menu）里的每一项都是去点酒馆原来的按钮，找不到的按钮不显示
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


    function ago(ms) {
        if (!ms) return '';
        const d = (Date.now() - ms) / 864e5;
        if (d < 1) return '今天';
        if (d < 2) return '昨天';
        if (d < 30) return `${Math.floor(d)} 天前`;
        if (d < 365) return `${Math.floor(d / 30)} 个月前`;
        return `${Math.floor(d / 365)} 年前`;
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

    // 列表每行的副标题：「角色 · 6 天前」「群聊 · 3 位」
    function decorateList() {
        if (!charList) return;
        const c = SillyTavern.getContext();
        charList.querySelectorAll('.character_select').forEach(row => {
            const ch = c.characters[row.dataset.chid];
            const box = row.querySelector('.character_select_container');
            if (ch && box) box.dataset.npSub = `角色 · ${ago(ch.date_last_chat) || '还没聊过'}`;
        });
        charList.querySelectorAll('.group_select').forEach(row => {
            const g = c.groups.find(x => x.id === row.dataset.grid);
            const box = row.querySelector('.group_name_block')?.parentElement;
            if (g && box) box.dataset.npSub = `群聊 · ${g.members?.length || 0} 位`;
        });
        markCur();
    }

    // ---------- 右边面板：标题栏 ----------
    const panel = document.getElementById('right-nav-panel');
    const chBlock = document.getElementById('rm_ch_create_block');
    const rhead = mk('div', { id: 'np_rhead' });
    rhead.innerHTML = '<div class="np-rh-back interactable" tabindex="0"></div><div class="np-rh-title"></div><div class="np-rh-done menu_button interactable" tabindex="0">完成</div><div class="np-rh-pin interactable" tabindex="0" title="固定面板"></div>';
    if (panel) { panel.prepend(rhead); made.push(rhead); }
    const pinBox = document.getElementById('rm_button_panel_pin');
    const click = sel => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; el?.click(); return !!el; };

    function setEditing(on) {
        root.classList.toggle('np-editing', !!on);
        renderHead();
    }

    function renderHead() {
        const type = panel?.dataset.menuType || '';
        const editing = root.classList.contains('np-editing');
        rhead.dataset.mode = type === 'characters' ? 'lib' : type === 'character_edit' ? (editing ? 'edit' : 'about') : 'other';
        rhead.querySelector('.np-rh-title').textContent = { lib: '资料库', about: '正在播放', edit: '编辑设定' }[rhead.dataset.mode] || '';
        rhead.querySelector('.np-rh-back').title = rhead.dataset.mode === 'edit' ? '回到展示页' : '资料库';
        rhead.querySelector('.np-rh-pin').classList.toggle('np-on', !!pinBox?.checked);
    }

    rhead.querySelector('.np-rh-back').addEventListener('click', () => {
        if (rhead.dataset.mode === 'edit') setEditing(false);
        else if (rhead.dataset.mode === 'about') click('#rm_button_characters');
    });
    rhead.querySelector('.np-rh-done').addEventListener('click', () => setEditing(false));
    rhead.querySelector('.np-rh-pin').addEventListener('click', () => { pinBox?.click(); setTimeout(renderHead); });

    // ---------- 右边面板：单个角色的展示页 ----------
    const about = mk('div', { id: 'np_about' });
    about.innerHTML = `<img class="np-big" alt="">
        <div class="np-name"></div>
        <div class="np-by"></div>
        <div class="np-acts">
            <div class="np-act np-fav interactable" tabindex="0" title="收藏"></div>
            <div class="np-act np-edit interactable" tabindex="0" title="编辑设定"></div>
            <div class="np-act np-more interactable" tabindex="0" title="更多"></div>
        </div>
        <div class="np-card"><div class="np-card-img">关于这位角色</div><div class="np-card-stat"></div><div class="np-card-body"></div></div>`;
    if (chBlock) { chBlock.prepend(about); made.push(about); }

    function renderAbout() {
        const c = SillyTavern.getContext();
        const ch = c.characters[c.characterId];
        about.hidden = !ch;
        if (!ch) return;
        const name = ch.name;
        const sub = s => String(s || '').replace(/\{\{char\}\}/gi, name).replace(/\{\{user\}\}/gi, c.name1).trim();
        about.querySelector('.np-big').src = avatarUrl(ch.avatar);
        about.querySelector('.np-name').textContent = name;
        const creator = ch.data?.creator;
        about.querySelector('.np-by').textContent = [creator ? `作者 ${creator}` : '角色', ch.data?.character_version].filter(Boolean).join(' · ');
        // 收藏状态以酒馆按钮为准（点了以后要等自动保存，角色数据才会变）
        const favBtn = document.getElementById('favorite_button');
        about.querySelector('.np-fav').classList.toggle('np-on', favBtn ? favBtn.classList.contains('fav_on') : (ch.fav === true || ch.fav === 'true'));
        const mine = c.groupId ? 0 : (c.chat || []).filter(m => m.is_user).length;
        const tokens = document.getElementById('result_info_total_tokens')?.textContent?.trim();
        about.querySelector('.np-card-stat').textContent = [c.groupId ? '' : `这段聊天里你说了 ${mine} 句`, tokens ? `设定 ${tokens} 词符` : ''].filter(Boolean).join(' · ');
        const body = about.querySelector('.np-card-body');
        body.textContent = sub(ch.description || ch.data?.description) || '（没有写简介）';
        body.classList.remove('np-open');
    }

    about.querySelector('.np-fav').addEventListener('click', () => { click('#favorite_button'); setTimeout(renderAbout, 50); });
    about.querySelector('.np-edit').addEventListener('click', () => setEditing(true));
    about.querySelector('.np-card').addEventListener('click', () => about.querySelector('.np-card-body').classList.toggle('np-open'));

    // ---------- ⋯ 菜单 ----------
    const menu = mk('div', { id: 'np_menu', hidden: true }, document.body);
    const shown = el => el && el.style.display !== 'none' && !el.classList.contains('displayNone');
    function menuItems() {
        const btn = (icon, label, sel, cls = '') => {
            const el = document.querySelector(sel);
            return shown(el) ? { icon, label, run: () => el.click(), cls } : null;
        };
        const list = [
            { icon: 'fa-pencil', label: '编辑设定', run: () => setEditing(true) },
            btn('fa-book', '高级定义', '#advanced_div'),
            btn('fa-globe', '角色世界书', '#world_button'),
            btn('fa-passport', '聊天世界书', '#rm_ch_create_block .chat_lorebook_button'),
            btn('fa-face-smile', '角色关联', '#char_connections_button'),
            btn('fa-file-export', '导出', '#export_button'),
            btn('fa-clone', '复制一份', '#dupe_button'),
            btn('fa-ranking-star', '词符统计', '#right-nav-panel .rm_stats_button'),
            'sep',
        ];
        const optIcon = { set_character_world: 'fa-link', import_character_info: 'fa-file-import', set_chat_character_settings: 'fa-gear', convert_to_persona: 'fa-user', renameCharButton: 'fa-pencil', character_source: 'fa-globe', replace_update: 'fa-undo', import_tags: 'fa-tags', set_as_assistant: 'fa-face-smile', show_char_gallery: 'fa-images' };
        // 酒馆的「更多…」下拉：每个选项照搬（文字是酒馆自己的，跟着界面语言走）
        const dd = document.getElementById('char-management-dropdown');
        [...(dd?.options || [])].forEach(o => {
            if (!o.value || o.disabled || o.hidden || o.style.display === 'none') return;
            list.push({ icon: optIcon[o.id] || 'fa-circle-dot', label: o.textContent.trim(), run: () => { dd.value = o.value; dd.dispatchEvent(new Event('change', { bubbles: true })); } });
        });
        list.push('sep', btn('fa-trash-can', '删除角色', '#delete_button', 'np-danger'));
        return list.filter(Boolean).filter((x, i, a) => x !== 'sep' || (i > 0 && a[i - 1] !== 'sep' && i < a.length - 1));
    }

    function openMenu(anchor) {
        menu.innerHTML = '';
        menuItems().forEach(it => {
            if (it === 'sep') { menu.append(mk('hr')); return; }
            const row = mk('div', { className: `np-mi interactable ${it.cls || ''}`, tabIndex: 0 });
            row.innerHTML = `<i class="fa-solid ${it.icon}"></i><span>${esc(it.label)}</span>`;
            row.addEventListener('click', () => { closeMenu(); it.run(); });
            menu.append(row);
        });
        menu.hidden = false;
        const r = anchor.getBoundingClientRect();
        const h = menu.offsetHeight, w = menu.offsetWidth;
        const below = r.bottom + 6 + h < innerHeight;
        menu.style.top = `${Math.max(8, below ? r.bottom + 6 : r.top - 6 - h)}px`;
        menu.style.left = `${Math.min(Math.max(8, r.left), innerWidth - w - 8)}px`;
        menu.querySelector('.np-mi')?.focus();
    }
    function closeMenu() { menu.hidden = true; }
    about.querySelector('.np-more').addEventListener('click', e => { e.stopPropagation(); menu.hidden ? openMenu(e.currentTarget) : closeMenu(); });
    const onDoc = e => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.np-more')) closeMenu(); };
    const onKey = e => {
        if (e.key === 'Escape') closeMenu();
        if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#np_menu .np-mi, #np_about .np-act, #np_rhead .interactable')) { e.preventDefault(); e.target.click(); }
    };
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey);

    function renderAll() {
        const cur = current();
        paintArt(cur?.avatar);
        renderHero();
        renderNow();
        decorateList();
        renderAbout();
        renderHead();
    }


    // ---------- 跟着酒馆 ----------
    const { eventSource, eventTypes: T } = st;
    const soon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(renderAll, 60); }; })();
    const light = () => { renderNow(); renderHero(); };
    const subs = [
        [T.CHAT_CHANGED, soon],
        [T.CHARACTER_EDITED, soon],
        [T.CHARACTER_PAGE_LOADED, decorateList],
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
    const moList = new MutationObserver(decorateList);
    if (charList) moList.observe(charList, { childList: true });
    // 面板换了页（列表 / 单个角色 / 新建 / 群聊）：退出编辑，换标题
    const moPanel = new MutationObserver(() => {
        if (panel.dataset.menuType !== 'character_edit') root.classList.remove('np-editing');
        closeMenu();
        renderAbout();
        renderHead();
    });
    if (panel) moPanel.observe(panel, { attributes: true, attributeFilter: ['data-menu-type'] });

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
        moPanel.disconnect();
        document.removeEventListener('click', onDoc, true);
        document.removeEventListener('keydown', onKey);
        charList?.querySelectorAll('[data-np-sub]').forEach(el => delete el.dataset.npSub);
        charList?.querySelectorAll('.np-cur').forEach(el => el.classList.remove('np-cur'));
        ro.disconnect();
        chatEl.removeEventListener('scroll', onScroll);
        made.forEach(el => el.remove());
        root.classList.remove('np-js', 'np-scrolled', 'np-editing');
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
