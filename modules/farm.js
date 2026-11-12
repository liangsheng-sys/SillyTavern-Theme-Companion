// 农场对话框 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 日历时钟：聊天区右边挂一块板（右边面板钉住时挂左边）—— 表盘（太阳 / 月亮按钟点走）、星期和日期、季节和昼夜图标、时间，
//    底下一块计数牌是这个聊天一共几楼。样式在 style.css 的 #sv_clock。
// 2. 体力条 = 上下文用了多少：最近一次发出去的提示词有多少词符 / 上下文上限。电脑挂在聊天区右下，手机贴在输入框上沿。
// 3. 季节配色：主题设置里选「跟着日历」时，按月份给 <html> 写 data-sv-season；选了固定的季节就写那个。
// 4. 生成中：<html> 加 sv-gen，最后一条角色消息右下角出现一只一上一下跳的小箭头。
// 5. 好感心心：每条角色消息的名牌下面一排十颗心，点一下改，按角色名存在酒馆设置里（extension_settings.farm_hearts）。
// 6. 头像「清晰原图」：把聊天里的头像缩略图换成原图（样式那边同时把像素放大关掉）。
// 没装扩展就没有这些（只有主题本身的样子）。

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
const SEASON_NAME = { spring: '春', summer: '夏', fall: '秋', winter: '冬' };
const HEARTS = 10;

export default function farm(api) {
    const opt = (k, d) => { try { return api?.get?.(k) ?? d; } catch { return d; } };
    const ctx = () => window.SillyTavern?.getContext?.();
    const root = document.documentElement;
    const offs = [];   // 清理时要做的事

    // ---------------- 日历时钟 ----------------
    const box = document.createElement('div');
    box.id = 'sv_clock';
    box.innerHTML = `
        <div class="sv-dial"><div class="sv-hand"></div></div>
        <div class="sv-board">
            <div class="sv-row sv-date"></div>
            <div class="sv-row sv-icons"><i class="sv-ico sv-season"></i><i class="sv-ico sv-daynight"></i></div>
            <div class="sv-row sv-time"></div>
        </div>
        <div class="sv-count" title="这个聊天一共几楼"><b>楼</b><span></span></div>`;
    document.body.append(box);
    offs.push(() => box.remove());

    const $date = box.querySelector('.sv-date');
    const $time = box.querySelector('.sv-time');
    const $count = box.querySelector('.sv-count span');
    const $season = box.querySelector('.sv-season');

    function tick() {
        const d = new Date();
        const h = d.getHours(), m = d.getMinutes();
        const season = SEASON[d.getMonth()];
        const night = h < 6 || h >= 18;
        box.dataset.season = season;
        box.classList.toggle('sv-night', night);
        $season.title = SEASON_NAME[season] + '天';
        $date.textContent = `${WEEK[d.getDay()]} ${d.getDate()}`;
        const h12 = h % 12 || 12;
        $time.textContent = `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
        // 白天：6 点在左（0°）、12 点在上（90°）、18 点在右（180°）；夜里月亮同样从左走到右
        const t = ((h + m / 60) - (night ? (h < 6 ? -6 : 18) : 6)) / 12;
        box.style.setProperty('--sv-hand', `${Math.round(t * 180)}deg`);
    }

    function count() {
        const chat = ctx()?.chat;
        $count.textContent = String(Array.isArray(chat) ? chat.length : 0);
    }

    // ---------------- 体力条（上下文用量） ----------------
    const bar = document.createElement('div');
    bar.id = 'sv_energy';
    bar.innerHTML = `<b>E</b><div class="sv-tank"><i></i></div>`;
    const $fill = bar.querySelector('i');
    const mq = matchMedia('(max-width: 1000px)');
    function placeBar() {
        const form = document.getElementById('form_sheld');
        if (mq.matches && form) { if (bar.parentElement !== form) form.append(bar); }
        else if (bar.parentElement !== document.body) document.body.append(bar);
    }
    placeBar();
    mq.addEventListener('change', placeBar);
    offs.push(() => { mq.removeEventListener('change', placeBar); bar.remove(); });

    // 酒馆的 script.js：模块是同一份，拿得到 itemizedPrompts（每次发送的提示词记录）和 getMaxContextSize
    const stUrl = import.meta.url.startsWith('blob:') ? new URL('/script.js', location.href).href : new URL('../../../../../script.js', import.meta.url).href;
    let st = null;
    const stReady = import(stUrl).then(m => (st = m)).catch(() => null);

    function flatten(raw) {
        if (typeof raw === 'string') return raw;
        if (!Array.isArray(raw)) return '';
        return raw.map(m => typeof m?.content === 'string' ? m.content
            : Array.isArray(m?.content) ? m.content.map(p => p?.text || '').join('\n') : '').join('\n');
    }

    let energySeq = 0;
    async function energy() {
        const seq = ++energySeq;
        await stReady;
        const c = ctx();
        const list = st?.itemizedPrompts;
        let used = 0, max = 0;
        try { max = Number(st?.getMaxContextSize?.()) || Number(c?.maxContext) || 0; } catch { max = Number(c?.maxContext) || 0; }
        const last = Array.isArray(list) && list.length ? list.reduce((a, b) => (Number(b.mesId) > Number(a.mesId) ? b : a)) : null;
        if (last) {
            if (Number(last.oaiTotalTokens) > 0) used = Number(last.oaiTotalTokens);
            else {
                try { used = await c.getTokenCountAsync(flatten(last.rawPrompt), 0); } catch { used = 0; }
            }
        }
        if (seq !== energySeq) return;
        const r = max > 0 && used > 0 ? Math.min(1, used / max) : 0;
        bar.style.setProperty('--sv-e', r.toFixed(3));
        bar.dataset.level = !used ? 'none' : r >= 0.9 ? 'low' : r >= 0.7 ? 'mid' : 'ok';
        bar.title = used
            ? `上下文：${used.toLocaleString()} / ${max.toLocaleString()} 词符（${Math.round(r * 100)}%）\n按最近一次发出去的提示词算`
            : '上下文用量：这个聊天还没发过消息（发一次就有了）';
    }

    // ---------------- 好感心心 ----------------
    const store = () => {
        const s = ctx()?.extensionSettings;
        if (!s) return {};
        return (s.farm_hearts ||= {});
    };
    const heartCss = document.createElement('style');
    heartCss.id = 'sv_hearts_css';
    document.head.append(heartCss);
    offs.push(() => heartCss.remove());
    const q = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
    function heartRules() {
        const lines = [];
        for (const [name, n] of Object.entries(store())) {
            if (n > 0) lines.push(`#chat .mes[ch_name=${q(name)}] .sv-hearts i:nth-child(-n + ${Math.min(HEARTS, n)}) { --sv-hc: var(--sv-heart); --sv-hc-hi: var(--sv-heart-hi); }`);
        }
        heartCss.textContent = lines.join('\n');
    }
    const heartsHtml = () => `<div class="sv-hearts" title="好感（点心心改）">${'<i></i>'.repeat(HEARTS)}</div>`;
    function addHearts(wrapper) {
        if (!wrapper || wrapper.querySelector(':scope > .sv-hearts')) return;
        const ava = wrapper.querySelector(':scope > .avatar');
        if (ava) ava.insertAdjacentHTML('afterend', heartsHtml());
    }
    // 消息模板里也插一份，之后新出来的消息自带
    const tpl = document.querySelector('#message_template .mesAvatarWrapper');
    function allHearts() {
        addHearts(tpl);
        document.querySelectorAll('#chat .mes .mesAvatarWrapper').forEach(addHearts);
    }
    function onHeart(e) {
        const i = e.target.closest?.('.sv-hearts i');
        if (!i) return;
        const name = i.closest('.mes')?.getAttribute('ch_name');
        if (!name) return;
        e.stopPropagation();
        const k = [...i.parentElement.children].indexOf(i) + 1;
        const s = store();
        s[name] = (s[name] || 0) === k ? k - 1 : k;   // 点亮着的最后一颗 = 少一颗
        heartRules();
        ctx()?.saveSettingsDebounced?.();
    }
    document.addEventListener('click', onHeart, true);
    offs.push(() => {
        document.removeEventListener('click', onHeart, true);
        document.querySelectorAll('.sv-hearts').forEach(e => e.remove());
    });

    // ---------------- 头像：清晰原图 ----------------
    function avatars() {
        const clear = opt('avatar', 'pixel') === 'clear';
        document.querySelectorAll('#chat .mes .mesAvatarWrapper .avatar img').forEach(img => {
            const src = img.getAttribute('src') || '';
            if (clear) {
                const m = src.match(/thumbnail\?type=avatar&file=([^&]+)/);
                if (m) { img.dataset.svThumb = src; img.src = `/characters/${m[1]}`; }
            } else if (img.dataset.svThumb && !src.includes('thumbnail?')) {
                img.src = img.dataset.svThumb;
                delete img.dataset.svThumb;
            }
        });
    }
    offs.push(() => {
        document.querySelectorAll('img[data-sv-thumb]').forEach(img => { img.src = img.dataset.svThumb; delete img.dataset.svThumb; });
    });

    // ---------------- 季节配色 ----------------
    function season() {
        const pick = opt('season', 'summer');
        const s = pick === 'auto' ? SEASON[new Date().getMonth()] : pick;
        if (root.dataset.svSeason !== s) root.dataset.svSeason = s;
    }
    offs.push(() => { delete root.dataset.svSeason; });

    // ---------------- 生成中 ----------------
    const genOn = (_type, _opts, dryRun) => { if (!dryRun) root.classList.add('sv-gen'); };
    const genOff = () => { root.classList.remove('sv-gen'); energy(); };
    offs.push(() => root.classList.remove('sv-gen'));

    // ---------------- 开始 ----------------
    const onChat = () => { count(); heartRules(); allHearts(); avatars(); setTimeout(energy, 300); };
    const onRender = () => { count(); allHearts(); avatars(); };
    tick();
    season();
    onChat();
    const t1 = setInterval(tick, 20 * 1000);
    const t2 = setInterval(() => { season(); avatars(); }, 1500);   // 主题设置改了，一两秒内跟上
    offs.push(() => { clearInterval(t1); clearInterval(t2); });

    const c = ctx();
    const T = c?.eventTypes || {};
    const on = (e, f) => { if (e && c?.eventSource) { c.eventSource.on(e, f); offs.push(() => c.eventSource.removeListener?.(e, f)); } };
    on(T.CHAT_CHANGED, onChat);
    for (const e of [T.MESSAGE_RECEIVED, T.MESSAGE_SENT, T.MESSAGE_DELETED, T.MESSAGE_SWIPED, T.MESSAGE_UPDATED,
        T.CHARACTER_MESSAGE_RENDERED, T.USER_MESSAGE_RENDERED, T.MORE_MESSAGES_LOADED]) on(e, onRender);
    on(T.GENERATION_STARTED, genOn);
    on(T.GENERATION_ENDED, genOff);
    on(T.GENERATION_STOPPED, genOff);

    return () => { for (const f of offs.reverse()) { try { f(); } catch { /* 忽略 */ } } };
}
