/*
 * 酒馆年报：把一年的聊天整理成一叠竖着翻的卡片
 * 由 companion.js 在点「年报」时按需载入（扩展里是 modules/nowplaying-wrapped.js）
 *
 * 数据：只在浏览器里算，用酒馆自己的接口读聊天记录，不上传、不改任何东西。
 *   1. 每个角色列一遍聊天文件（/api/characters/chats，顺带拿到最后一条消息的时间、条数、大小）
 *      最后一条消息在今年之前的文件直接跳过
 *   2. 逐个读文件（/api/chats/get；群聊 /api/chats/group/get），每个文件压成一份按年分好的小结
 *   3. 小结存进 IndexedDB，下次打开只重读大小或条数变了的文件
 * 样子在 wrapped.css；卡片的底纹是「你自己的波形」：这一年每天的消息数，从 1 月 1 日排到年底
 */

const DB_NAME = 'np-wrapped';
const STORE = 'chats';
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- 时间 ----------
// 酒馆不同版本、不同语言存的日期写法不一样：毫秒数、ISO、「June 19, 2023 2:20pm」、「2024-7-12@01h31m37s」、
// 也有人的聊天里是「2026年3月2日 21:10」。都按本地时间读，读不出来返回 0
export function parseTime(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v > 0 ? v : 0;
    const s = String(v).trim();
    if (/^\d+$/.test(s)) return Number(s);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const t = Date.parse(s); if (t) return t; }
    let m = s.match(/([a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{1,2})\s*(am|pm)/i);
    if (m) {
        const mon = MON.indexOf(m[1].slice(0, 3).toLowerCase());
        if (mon >= 0) return new Date(+m[3], mon, +m[2], (+m[4] % 12) + (/pm/i.test(m[6]) ? 12 : 0), +m[5]).getTime();
    }
    m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    m = s.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\D+?(\d{1,2}):(\d{2})/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
}

const dayOfYear = d => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 864e5);
const daysInYear = y => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5;
const dateOf = (y, doy) => new Date(y, 0, 1 + doy);

// 中文按字、英文和数字按词
function words(s) {
    s = String(s || '');
    return (s.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) || []).length + (s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
}

// ---------- 一个聊天文件 → 按年分好的小结 ----------
// owner：单聊是角色头像文件名（这段聊天里所有消息都算这位的）；群聊是 null，角色的话算开口的那位
function summarize(msgs, owner) {
    const years = {};
    for (const m of msgs) {
        if (!m || typeof m !== 'object' || typeof m.mes !== 'string' || !('is_user' in m)) continue;
        const t = parseTime(m.send_date);
        if (!t) continue;
        const d = new Date(t);
        const Y = years[d.getFullYear()] ??= { u: 0, a: 0, uw: 0, hours: Array(24).fill(0), days: {}, uwDays: {}, who: {}, first: 0, min: t, max: t, swipe: null };
        const doy = dayOfYear(d);
        Y.days[doy] = (Y.days[doy] || 0) + 1;
        if (t < Y.min) Y.min = t;
        if (t > Y.max) Y.max = t;
        if (m.is_user) {
            const w = words(m.mes);
            Y.u++;
            Y.uw += w;
            Y.uwDays[doy] = (Y.uwDays[doy] || 0) + w;
            Y.hours[d.getHours()]++;
            if (!Y.first || t < Y.first) Y.first = t;
            if (owner) Y.who[owner] = (Y.who[owner] || 0) + 1;
        } else {
            Y.a++;
            const who = owner || m.original_avatar;
            if (who) Y.who[who] = (Y.who[who] || 0) + 1;
            const n = Array.isArray(m.swipes) ? m.swipes.length : 0;
            if (n > 1 && (!Y.swipe || n > Y.swipe.n)) Y.swipe = { n, t, who: who || null, text: m.mes.slice(0, 600) };
        }
    }
    return years;
}

// ---------- 缓存 ----------
function openDb() {
    return new Promise(resolve => {
        try {
            const r = indexedDB.open(DB_NAME, 1);
            r.onupgradeneeded = () => r.result.createObjectStore(STORE);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => resolve(null);
        } catch { resolve(null); }
    });
}
const dbGet = (db, k) => new Promise(resolve => {
    if (!db) return resolve(undefined);
    try {
        const q = db.transaction(STORE).objectStore(STORE).get(k);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
});
const dbPut = (db, k, v) => new Promise(resolve => {
    if (!db) return resolve();
    try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = tx.onerror = () => resolve();
    } catch { resolve(); }
});

// ---------- 读全部聊天 ----------
// onProgress(读完几个, 一共几个)；signal 用来取消
async function collect(year, { onProgress, signal }) {
    const c = SillyTavern.getContext();
    const headers = c.getRequestHeaders();
    const post = (url, body) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }).then(r => (r.ok ? r.json() : null));
    const yearStart = new Date(year, 0, 1).getTime();
    const user = c.getCurrentUserHandle?.() || 'default';
    const db = await openDb();

    // 先列出所有聊天文件，今年没碰过的不读
    const jobs = [];
    let listed = 0;
    for (const ch of c.characters) {
        if (signal.aborted) throw new DOMException('取消', 'AbortError');
        const list = await post('/api/characters/chats', { avatar_url: ch.avatar }).catch(e => { if (e.name === 'AbortError') throw e; return null; });
        onProgress(0, 0, ++listed, c.characters.length);
        if (!Array.isArray(list)) continue;
        for (const f of list) {
            const last = parseTime(f.last_mes);
            if (last && last < yearStart) continue;
            const id = String(f.file_name).replace(/\.jsonl$/, '');
            jobs.push({
                key: `${user}|c|${ch.avatar}|${id}`,
                sig: `${f.file_size}|${f.chat_items}|${f.last_mes}`,
                owner: ch.avatar,
                chat: id,
                load: () => post('/api/chats/get', { ch_name: ch.name, file_name: id, avatar_url: ch.avatar }),
            });
        }
    }
    // 群聊没有「最后一条」的信息，每次都读（一般不多）
    for (const g of c.groups || []) {
        for (const id of g.chats || []) {
            jobs.push({ key: `${user}|g|${id}`, sig: null, owner: null, group: g.id, chat: id, load: () => post('/api/chats/group/get', { id }) });
        }
    }

    // 四个一起读
    const out = [];
    let done = 0, fetched = 0;
    const t0 = performance.now();
    const queue = jobs.slice();
    async function worker() {
        while (queue.length) {
            if (signal.aborted) throw new DOMException('取消', 'AbortError');
            const job = queue.shift();
            let years;
            const hit = job.sig ? await dbGet(db, job.key) : null;
            if (hit && hit.sig === job.sig) years = hit.years;
            else {
                const msgs = await job.load();
                fetched++;
                years = summarize(Array.isArray(msgs) ? msgs : [], job.owner);
                if (job.sig) dbPut(db, job.key, { sig: job.sig, years });
            }
            out.push({ owner: job.owner, group: job.group, chat: job.chat, years });
            onProgress(++done, jobs.length);
        }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { chats: out, timing: { files: jobs.length, fetched, ms: Math.round(performance.now() - t0) } };
}

// ---------- 一年的总账 ----------
function tally(year, chats) {
    const c = SillyTavern.getContext();
    const n = daysInYear(year);
    const now = new Date();
    // 今年只排到今天
    const shown = year === now.getFullYear() ? dayOfYear(now) + 1 : n;
    const days = Array(n).fill(0);
    const uwDays = Array(n).fill(0);
    const hours = Array(24).fill(0);
    const who = {};
    const ownerDays = {};
    let u = 0, a = 0, uw = 0, first = null, longest = null, swipe = null;
    for (const x of chats) {
        const Y = x.years[year];
        if (!Y) continue;
        u += Y.u;
        a += Y.a;
        uw += Y.uw;
        for (const [d, v] of Object.entries(Y.days)) days[d] += v;
        for (const [d, v] of Object.entries(Y.uwDays)) uwDays[d] += v;
        Y.hours.forEach((v, i) => { hours[i] += v; });
        for (const [k, v] of Object.entries(Y.who)) who[k] = (who[k] || 0) + v;
        // 单聊：每天的条数记到这位角色名下（群聊不分）
        if (x.owner) {
            const od = ownerDays[x.owner] ??= {};
            for (const [d, v] of Object.entries(Y.days)) od[d] = (od[d] || 0) + v;
        }
        if (Y.first && (!first || Y.first < first.t)) first = { t: Y.first, owner: x.owner, group: x.group };
        const len = Y.u + Y.a;
        if (!longest || len > longest.n) longest = { n: len, min: Y.min, max: Y.max, owner: x.owner, group: x.group, chat: x.chat, days: Y.days };
        if (Y.swipe && (!swipe || Y.swipe.n > swipe.n)) swipe = Y.swipe;
    }
    const peak = arr => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
    const top = Object.entries(who)
        .map(([avatar, count]) => ({ avatar, count, name: c.characters.find(ch => ch.avatar === avatar)?.name }))
        .filter(x => x.name)
        .sort((p, q) => q.count - p.count);
    return {
        year, shown, days: days.slice(0, shown), uwDays: uwDays.slice(0, shown), hours,
        total: u + a, u, a, uw,
        active: days.filter(Boolean).length,
        busiest: { doy: peak(days), n: days[peak(days)] },
        wordiest: { doy: peak(uwDays), n: uwDays[peak(uwDays)] },
        top, first, longest, swipe, ownerDays,
    };
}

// 单聊是角色，群聊是群：统一成 { name, avatar }（群的封面用第一位还在的成员）
function whoIs(owner, group) {
    const c = SillyTavern.getContext();
    if (owner) {
        const ch = c.characters.find(x => x.avatar === owner);
        return ch ? { name: ch.name, avatar: ch.avatar } : null;
    }
    const g = c.groups?.find(x => x.id === group);
    if (!g) return null;
    const av = (g.members || []).find(m => c.characters.some(ch => ch.avatar === m));
    return { name: g.name, avatar: av, group: true };
}

// ---------- 数字的说法 ----------
const fmt = n => Math.round(n).toLocaleString('zh-CN');
// 一万以上写「41.2 万」
function big(n) {
    if (n >= 1e4) {
        const w = n / 1e4;
        return { num: w >= 100 ? fmt(w) : w.toFixed(1).replace(/\.0$/, ''), unit: '万' };
    }
    return { num: fmt(n), unit: '' };
}
const md = d => `${d.getMonth() + 1} 月 ${d.getDate()} 日`;

// 字数换成好懂的东西
function wordsLike(n) {
    if (n >= 2e5) return `够印 ${(n / 2e5).toFixed(1).replace(/\.0$/, '')} 本二十万字的长篇小说`;
    if (n >= 1e4) return `差不多 ${Math.round(n / 1e4)} 篇万字短篇`;
    if (n >= 800) return `够写 ${Math.round(n / 800)} 篇八百字的作文`;
    return '每一个字都算数';
}

// ---------- 时段人格 ----------
// 找你发消息最多的连续三个小时（可以跨午夜），按中间那个钟点落在哪一段起名
const SHIFTS = [
    { from: 0, to: 5, name: '凌晨电台型', line: '城市睡了，你还在频道上。' },
    { from: 5, to: 9, name: '早班列车型', line: '天刚亮，你已经上线了。' },
    { from: 9, to: 12, name: '上午场型', line: '咖啡还热着，故事就开场了。' },
    { from: 12, to: 14, name: '午休摸鱼型', line: '午饭后的那一小时，是你们的。' },
    { from: 14, to: 18, name: '下午茶型', line: '下午三四点，最适合聊点闲话。' },
    { from: 18, to: 22, name: '下班后型', line: '忙完一天，回来说说话。' },
    { from: 22, to: 24, name: '夜猫子型', line: '夜越深，话越多。' },
];
function bestWindow(hours) {
    let best = 0, sum = -1;
    for (let i = 0; i < 24; i++) {
        const v = hours[i] + hours[(i + 1) % 24] + hours[(i + 2) % 24];
        if (v > sum) { sum = v; best = i; }
    }
    const mid = (best + 1) % 24;
    return { from: best, to: (best + 3) % 24, sum, shift: SHIFTS.find(x => mid >= x.from && mid < x.to) };
}
const inWindow = (h, w) => (h - w.from + 24) % 24 < 3;
const hourName = h => `${h < 5 ? '凌晨' : h < 9 ? '早上' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : '晚上'} ${h % 12 || 12} 点`;

// ---------- 卡片 ----------
// 每张卡：tone 底色（'base' = 面板色，否则一个颜色值）、html、wave 底下的音轨或 dial 钟面、mount 装上交互
// h：{ color(头像) → 封面色, cover(头像, 大不大) → 封面 HTML }，由 companion.js 传进来
function cards(s, h) {
    const esc = x => String(x ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const daySet = obj => s.days.map((_, i) => !!obj?.[i]);
    const list = [];
    list.push({
        id: 'open',
        tone: 'base',
        html: `<div class="npw-k">酒馆年报</div>
            <div class="npw-year">${s.year}</div>
            <p class="npw-lead"><span>这一年，</span><span>你来了 <b>${fmt(s.active)}</b> 天。</span></p>
            <p class="npw-sub">底下这条波形是你的 ${s.year}：每一根是一天，越高那天聊得越多。</p>`,
        wave: { data: s.days },
    });
    if (!s.total) {
        list.push({ id: 'empty', tone: 'var(--np-cover-6)', html: `<div class="npw-k">${s.year}</div><p class="npw-lead">这一年还没有聊天记录。</p>` });
        return list;
    }
    list.push({
        id: 'total',
        tone: 'var(--np-cover-7)',
        html: `<div class="npw-k">这一年的消息</div>
            <div class="npw-num"><span data-count="${s.total}">${fmt(s.total)}</span><small>条</small></div>
            <p class="npw-lead"><span>你写了 <b>${fmt(s.u)}</b> 条，</span><span>角色们回了 <b>${fmt(s.a)}</b> 条。</span></p>`,
        wave: { data: s.days, line: s.busiest.doy, note: `最热闹的一天 · ${md(dateOf(s.year, s.busiest.doy))} · ${fmt(s.busiest.n)} 条` },
    });
    const w = big(s.uw);
    list.push({
        id: 'words',
        tone: 'var(--np-cover-2)',
        html: `<div class="npw-k">你亲手写下的字</div>
            <div class="npw-num"><span data-count="${w.unit ? '' : s.uw}">${w.num}</span><small>${w.unit}字</small></div>
            <p class="npw-lead">${wordsLike(s.uw)}。</p>
            <p class="npw-sub">只算你自己发的消息，角色写的不算。</p>`,
        wave: { data: s.uwDays, line: s.wordiest.doy, note: `写得最多的一天 · ${md(dateOf(s.year, s.wordiest.doy))} · ${fmt(s.wordiest.n)} 字` },
    });

    const top = s.top;
    const no1 = top[0];
    // 猜一猜：第一名 + 第二到第五名里随便两位，打乱
    if (top.length >= 3) {
        const pool = top.slice(1, 5).sort(() => Math.random() - .5).slice(0, 2);
        const opts = [no1, ...pool].sort(() => Math.random() - .5);
        list.push({
            id: 'guess',
            tone: 'base',
            html: `<div class="npw-k">猜一猜</div>
                <p class="npw-lead npw-q">这一年，你聊得最多的是谁？</p>
                <div class="npw-picks">${opts.map(o => `<button class="npw-pick" type="button" data-av="${esc(o.avatar)}" data-name="${esc(o.name)}">${h.cover(o.avatar)}<span>${esc(o.name)}</span></button>`).join('')}</div>
                <p class="npw-sub npw-answer">点一个。</p>`,
            mount(card) {
                const answer = card.querySelector('.npw-answer');
                card.querySelectorAll('.npw-pick').forEach(btn => btn.addEventListener('click', e => {
                    e.stopPropagation();
                    if (card.querySelector('.npw-picks').dataset.done) return;
                    card.querySelector('.npw-picks').dataset.done = '1';
                    const right = btn.dataset.av === no1.avatar;
                    card.querySelectorAll('.npw-pick').forEach(b => b.classList.add(b.dataset.av === no1.avatar ? 'npw-right' : 'npw-wrong'));
                    answer.innerHTML = right
                        ? `猜对了。<b>${esc(no1.name)}</b> 这一年陪了你 <b>${fmt(no1.count)}</b> 条消息。`
                        : `不是 ${esc(btn.dataset.name)}。是 <b>${esc(no1.name)}</b>，一共 <b>${fmt(no1.count)}</b> 条消息。`;
                    answer.classList.add('npw-pop');
                }));
            },
        });
    }

    // 年度前五：底色取第一名的封面色；音轨点亮第一名出现过的日子
    if (no1) {
        const five = top.slice(0, 5);
        list.push({
            id: 'top',
            tone: h.color(no1.avatar),
            html: `<div class="npw-k">${five.length > 1 ? `年度前${'一二三四五'[five.length - 1]}` : '年度角色'}</div>
                <ol class="npw-top">${five.map((x, i) => `<li><b>${i + 1}</b>${h.cover(x.avatar, i === 0)}<span><em>${esc(x.name)}</em><small>${fmt(x.count)} 条消息</small></span></li>`).join('')}</ol>`,
            wave: { data: s.days.map((_, i) => s.ownerDays[no1.avatar]?.[i] || 0), note: `你和 ${esc(no1.name)} 的这一年` },
        });
    }

    // 时段人格：按你发消息的钟点
    const mine = s.hours.reduce((p, q) => p + q, 0);
    if (mine) {
        const win = bestWindow(s.hours);
        const sh = win.shift;
        const peakH = s.hours.indexOf(Math.max(...s.hours));
        list.push({
            id: 'hours',
            tone: 'var(--np-cover-5)',
            html: `<div class="npw-k">你的时段人格</div>
                <div class="npw-name">${sh.name}</div>
                <p class="npw-lead">${sh.line}</p>
                <p class="npw-sub">你 <b>${Math.round((win.sum / mine) * 100)}%</b> 的消息发在${hourName(win.from)}到${hourName(win.to)}之间，最常在${hourName(peakH)}出现。</p>`,
            dial: { hours: s.hours, win },
        });
    }

    // 最纠结的一句
    const sw = s.swipe;
    const swWho = sw && whoIs(sw.who);
    if (sw && sw.n > 2) {
        const d = new Date(sw.t);
        // 去掉表示动作的 *星号*，只留字
        const quote = sw.text.replace(/\*+/g, '').trim();
        list.push({
            id: 'swipe',
            tone: swWho ? h.color(swWho.avatar) : 'var(--np-cover-1)',
            html: `<div class="npw-k">最纠结的一句</div>
                <div class="npw-num"><span data-count="${sw.n}">${sw.n}</span><small>版</small></div>
                <p class="npw-lead"><span>这条回复换了 ${sw.n} 版，</span><span>你才留下它。</span></p>
                <p class="npw-sub">${swWho ? `来自 ${esc(swWho.name)} · ` : ''}${md(d)}</p>
                <button class="npw-btn npw-peek" type="button">看看是哪一句</button>
                <blockquote class="npw-quote" hidden>${esc(quote.length > 160 ? `${quote.slice(0, 160)}…` : quote)}</blockquote>`,
            wave: { data: s.days, line: dayOfYear(d) },
            mount(card) {
                card.querySelector('.npw-peek').addEventListener('click', e => {
                    e.stopPropagation();
                    e.currentTarget.hidden = true;
                    card.querySelector('.npw-quote').hidden = false;
                });
            },
        });
    }

    // 最长的一场
    const lg = s.longest;
    const lgWho = lg && whoIs(lg.owner, lg.group);
    if (lg && lgWho) {
        const m1 = new Date(lg.min).getMonth() + 1, m2 = new Date(lg.max).getMonth() + 1;
        list.push({
            id: 'longest',
            tone: h.color(lgWho.avatar),
            html: `<div class="npw-k">最长的一场</div>
                <div class="npw-num"><span data-count="${lg.n}">${fmt(lg.n)}</span><small>条消息</small></div>
                <p class="npw-lead"><span>和 ${esc(lgWho.name)}，</span><span>${m1 === m2 ? `在 ${m1} 月里一口气聊完。` : `从 ${m1} 月聊到 ${m2} 月。`}</span></p>
                <p class="npw-sub">这一场里，有 <b>${Object.keys(lg.days).length}</b> 天你们在说话。</p>`,
            wave: { data: s.days, hi: daySet(lg.days), note: '这一场在这一年里的位置' },
        });
    }

    // 今年的第一句话
    const fw = s.first && whoIs(s.first.owner, s.first.group);
    if (fw) {
        const d = new Date(s.first.t);
        list.push({
            id: 'first',
            tone: h.color(fw.avatar),
            html: `<div class="npw-k">今年的第一句话</div>
                <div class="npw-date">${d.getMonth() + 1}月${d.getDate()}日<small>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</small></div>
                <div class="npw-who">${h.cover(fw.avatar, true)}<p class="npw-lead">是对 <b>${esc(fw.name)}</b> 说的。</p></div>`,
            wave: { data: s.days, line: dayOfYear(d) },
        });
    }

    // 收尾：一张总结
    const shName = list.find(x => x.id === 'hours') ? list.find(x => x.id === 'hours').html.match(/npw-name">([^<]+)/)[1] : '—';
    list.push({
        id: 'end',
        tone: 'base',
        html: `<div class="npw-k">我的 ${s.year} 酒馆</div>
            <div class="npw-sum">
                <div><small>来了</small><b>${fmt(s.active)}</b><i>天</i></div>
                <div><small>消息</small><b>${s.total < 1e5 ? fmt(s.total) : big(s.total).num}</b><i>${s.total < 1e5 ? '' : '万'}条</i></div>
                <div><small>写下</small><b>${w.num}</b><i>${w.unit}字</i></div>
                <div><small>时段人格</small><b class="npw-sm">${shName}</b></div>
            </div>
            ${top.length ? `<div class="npw-k">年度角色</div><ol class="npw-mini">${top.slice(0, 3).map((x, i) => `<li>${h.cover(x.avatar)}<span><b>${i + 1}</b> ${esc(x.name)}</span></li>`).join('')}</ol>` : ''}
            <p class="npw-sub npw-sign">正在播放 · 酒馆年报</p>`,
        wave: { data: s.days },
    });
    return list;
}

// ---------- 音轨 ----------
// 像音频软件里的音轨：每天一根，以中线上下对称；底下一行月份刻度
// hi：哪些天点亮（其余压暗）；line：哪一天画一根播放头
function drawWave(cv, wave, year, t = 1) {
    const r = cv.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    if (!r.width) return;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(cv);
    const ink = css.getPropertyValue('--npw-ink').trim() || '#fff';
    const font = css.fontFamily;
    const { data, hi, line } = wave;
    const max = Math.max(1, ...data);
    const W = r.width;
    const LABEL = 18;
    const H = r.height - LABEL;
    const mid = H / 2;
    const step = W / data.length;
    const bw = Math.max(1, step - (step > 2.5 ? 1 : 0));
    const dim = hi || line != null;
    g.fillStyle = ink;
    // 中线：没聊的日子也连着，像一条还没放到的轨道
    g.globalAlpha = .3;
    g.fillRect(0, mid - .5, W, 1);
    // 从左往右放出来：t 是 0..1 的进度
    const upto = data.length * t;
    for (let i = 0; i < data.length && i < upto; i++) {
        const v = data[i];
        if (!v) continue;
        const h = Math.max(2, Math.sqrt(v / max) * H) * Math.min(1, upto - i);
        g.globalAlpha = !dim ? .95 : (hi ? hi[i] : i === line) ? 1 : .32;
        g.fillRect(i * step, mid - h / 2, bw, h);
    }
    if (line != null && t >= 1) {
        g.globalAlpha = 1;
        g.fillRect(line * step + bw / 2 - 1, 0, 2, H);
    }
    // 月份刻度
    g.globalAlpha = .9;
    g.font = `700 11px ${font}`;
    g.textBaseline = 'bottom';
    for (let m = 0; m < 12; m++) {
        const doy = dayOfYear(new Date(year, m, 1));
        if (doy >= data.length) break;
        if (m % (W < 300 ? 3 : 2)) continue;
        g.fillText(`${m + 1}月`, doy * step, r.height);
    }
}

// ---------- 钟面 ----------
// 24 小时一圈，0 点在正上方；每小时一根往外长的条，你的时段那一段亮，其余压暗
function drawDial(cv, dial, t = 1) {
    const r = cv.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    if (!r.width) return;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(cv);
    const ink = css.getPropertyValue('--npw-ink').trim() || '#fff';
    const font = css.fontFamily;
    const cx = r.width / 2, cy = r.height / 2;
    const R = Math.min(cx, cy) - 16;
    const r0 = R * .34;
    const max = Math.max(1, ...dial.hours);
    g.fillStyle = g.strokeStyle = ink;
    g.globalAlpha = .3;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, r0, 0, Math.PI * 2);
    g.stroke();
    const span = Math.PI * 2 / 24;
    for (let i = 0; i < 24; i++) {
        const v = dial.hours[i];
        const len = (R - r0) * Math.sqrt(v / max) * t;
        const a0 = -Math.PI / 2 + i * span + span * .12;
        const a1 = a0 + span * .76;
        g.globalAlpha = inWindow(i, dial.win) ? 1 : .38;
        g.beginPath();
        g.arc(cx, cy, r0 + 3 + len, a0, a1);
        g.arc(cx, cy, r0 + 3, a1, a0, true);
        g.closePath();
        g.fill();
    }
    g.globalAlpha = .9;
    g.font = `700 12px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [[0, '0'], [6, '6'], [12, '12'], [18, '18']].forEach(([hh, label]) => {
        const a = -Math.PI / 2 + hh * span;
        g.fillText(label, cx + Math.cos(a) * (r0 - 14), cy + Math.sin(a) * (r0 - 14));
    });
}

// ---------- 界面 ----------
let current = null;

export function close() {
    current?.();
    current = null;
}

// helpers：{ colorOf(头像) → Promise<颜色>, cover(头像, 大不大) → 封面 HTML }（companion.js 提供，默认头像会画成首字封面）
export function open(helpers = {}) {
    close();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced-motion');
    const year = new Date().getFullYear();
    const wrap = document.createElement('div');
    wrap.id = 'np_wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', '酒馆年报');
    wrap.innerHTML = `<div class="npw-stage">
            <div class="npw-bars"></div>
            <button class="npw-close" type="button" title="关掉（Esc）" aria-label="关掉"></button>
            <div class="npw-card"></div>
            <div class="npw-tap npw-prev" aria-hidden="true"></div>
            <div class="npw-tap npw-next" aria-hidden="true"></div>
        </div>`;
    document.body.append(wrap);
    const card = wrap.querySelector('.npw-card');
    const bars = wrap.querySelector('.npw-bars');
    const ac = new AbortController();
    let list = [], at = 0, raf = 0;

    // 读取中
    card.dataset.tone = 'base';
    card.style.removeProperty('--npw-bg');
    card.innerHTML = `<div class="npw-load">
            <div class="npw-k">酒馆年报</div>
            <div class="npw-year">${year}</div>
            <p class="npw-lead">正在读你的聊天记录</p>
            <div class="npw-prog"><i></i></div>
            <p class="npw-sub npw-count">先看看都有哪些聊天…</p>
            <p class="npw-sub">只在你的浏览器里算，不上传，也不改任何聊天。第一次比较慢，之后会记住。</p>
            <button class="npw-btn npw-cancel" type="button">取消</button>
        </div>`;
    card.querySelector('.npw-cancel').addEventListener('click', () => close());
    const prog = card.querySelector('.npw-prog i');
    const count = card.querySelector('.npw-count');
    const onProgress = (done, total, listed, chars) => {
        if (listed != null) { count.textContent = `列聊天文件 ${listed} / ${chars} 位角色`; prog.style.width = `${(listed / chars) * 15}%`; return; }
        count.textContent = `读了 ${done} / ${total} 个聊天`;
        prog.style.width = `${15 + (done / Math.max(1, total)) * 85}%`;
    };

    function show(i) {
        at = Math.max(0, Math.min(list.length - 1, i));
        const it = list[at];
        cancelAnimationFrame(raf);
        card.dataset.tone = it.tone === 'base' ? 'base' : 'color';
        if (it.tone === 'base') card.style.removeProperty('--npw-bg');
        else card.style.setProperty('--npw-bg', it.tone);
        card.dataset.id = it.id;
        const art = it.wave ? `<div class="npw-wave">${it.wave.note ? `<div class="npw-note">${it.wave.note}</div>` : ''}<canvas></canvas></div>`
            : it.dial ? '<div class="npw-dial"><canvas></canvas></div>' : '';
        card.innerHTML = `<div class="npw-body">${it.html}</div>${art}`;
        it.mount?.(card);
        // 换卡时重播入场动画
        card.classList.remove('npw-in');
        void card.offsetWidth;
        card.classList.add('npw-in');
        bars.innerHTML = list.map((_, j) => `<i class="${j < at ? 'npw-done' : j === at ? 'npw-now' : ''}"></i>`).join('');
        const cv = card.querySelector('canvas');
        const draw = (e = 1) => { if (!cv) return; if (it.wave) drawWave(cv, it.wave, year, e); else drawDial(cv, it.dial, e); };
        const counters = [...card.querySelectorAll('[data-count]')].filter(el => el.dataset.count);
        if (reduce) { draw(); return; }
        const t0 = performance.now();
        const frame = now => {
            const t = Math.min(1, (now - t0) / 1100);
            const e = 1 - (1 - t) ** 3;
            draw(e);
            counters.forEach(el => { el.textContent = fmt(Number(el.dataset.count) * e); });
            if (t < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
    }

    const go = d => { if (list.length) show(at + d); };
    wrap.querySelector('.npw-prev').addEventListener('click', () => go(-1));
    wrap.querySelector('.npw-next').addEventListener('click', () => go(1));
    wrap.querySelector('.npw-close').addEventListener('click', () => close());
    const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', onKey, true);
    const onResize = () => {
        const cv = card.querySelector('canvas');
        const it = list[at];
        if (cv && it?.wave) drawWave(cv, it.wave, year);
        else if (cv && it?.dial) drawDial(cv, it.dial);
    };
    addEventListener('resize', onResize);
    card.tabIndex = -1;
    card.focus({ preventScroll: true });

    current = () => {
        ac.abort();
        cancelAnimationFrame(raf);
        document.removeEventListener('keydown', onKey, true);
        removeEventListener('resize', onResize);
        wrap.remove();
    };

    collect(year, { onProgress, signal: ac.signal })
        .then(async ({ chats, timing }) => {
            if (ac.signal.aborted) return;
            const s = tally(year, chats);
            window.npWrapped = { stats: s, timing };
            // 要用到的头像先把颜色取好（也顺便认出默认头像），卡片里就能直接用
            const need = new Set([...s.top.slice(0, 5).map(x => x.avatar), whoIs(s.swipe?.who)?.avatar, whoIs(s.longest?.owner, s.longest?.group)?.avatar, whoIs(s.first?.owner, s.first?.group)?.avatar].filter(Boolean));
            const colors = {};
            await Promise.all([...need].map(async av => { colors[av] = (await helpers.colorOf?.(av).catch(() => null)) || 'var(--np-art-default)'; }));
            if (ac.signal.aborted) return;
            const thumb = av => `/thumbnail?type=avatar&file=${encodeURIComponent(av)}`;
            list = cards(s, {
                color: av => colors[av] || 'var(--np-art-default)',
                cover: (av, large) => `<span class="npw-cv${large ? ' npw-cv-l' : ''}">${helpers.cover ? helpers.cover(av, large) : `<img src="${thumb(av)}" alt="">`}</span>`,
            });
            wrap.querySelector('.npw-stage').classList.add('npw-ready');
            show(0);
        })
        .catch(e => {
            if (e?.name === 'AbortError') return;
            console.error('[正在播放] 年报读取失败', e);
            card.querySelector('.npw-count').textContent = `读取失败：${e?.message || e}`;
        });
}
