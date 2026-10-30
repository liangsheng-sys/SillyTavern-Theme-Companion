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
    s = String(s || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=\s]*/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[A-Za-z0-9+/=_-]{40,}/g, ' ');
    return (s.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) || []).length + (s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
}

// ---------- 一个聊天文件 → 按年分好的小结 ----------
// owner：单聊是角色头像文件名（这段聊天里所有消息都算这位的）；群聊是 null，角色的话算开口的那位
// 导入的聊天（别的软件转过来、或者整段粘贴后补的）常常几百条共用一个时间：
// 这种时间不可信，条数和字数照算，但不记进哪一天、几点、第一句
const SAME_TIME = 20;
function summarize(msgs, owner) {
    const years = {};
    const seen = {};
    for (const m of msgs) if (m && m.send_date != null) seen[m.send_date] = (seen[m.send_date] || 0) + 1;
    for (const m of msgs) {
        if (!m || typeof m !== 'object' || typeof m.mes !== 'string' || !('is_user' in m)) continue;
        const t = parseTime(m.send_date);
        if (!t) continue;
        const d = new Date(t);
        const Y = years[d.getFullYear()] ??= { u: 0, a: 0, uw: 0, hours: Array(24).fill(0), days: {}, uwDays: {}, who: {}, first: 0, min: 0, max: 0, swipe: null, undated: 0 };
        const dated = seen[m.send_date] < SAME_TIME;
        const doy = dayOfYear(d);
        if (dated) {
            Y.days[doy] = (Y.days[doy] || 0) + 1;
            if (!Y.min || t < Y.min) Y.min = t;
            if (t > Y.max) Y.max = t;
        } else Y.undated++;
        if (m.is_user) {
            const w = words(m.mes);
            Y.u++;
            Y.uw += w;
            if (!Y.bigU || w > Y.bigU.w) Y.bigU = { w, t: dated ? t : 0 };
            if (dated) {
                Y.uwDays[doy] = (Y.uwDays[doy] || 0) + w;
                Y.hours[d.getHours()]++;
                if (!Y.first || t < Y.first) Y.first = t;
            }
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

// 聊天的「指纹」：开头几条消息的时间和前几十个字。导入的备份和原聊天开头一样，指纹相同的只算一份
function fingerprint(msgs) {
    const head = [];
    for (const m of msgs) {
        if (!m || typeof m.mes !== 'string' || !('is_user' in m)) continue;
        head.push(`${m.send_date}|${m.is_user ? 1 : 0}|${m.mes.slice(0, 40)}`);
        if (head.length === 4) break;
    }
    if (head.length < 2) return null;
    let h = 5381;
    for (const ch of head.join('\n')) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
    return `${head.length}:${h.toString(36)}`;
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
// 统计的算法改了就加一，旧缓存自动作废
const CACHE_V = 4;
// 同一次打开网页里再看年报：角色和聊天都没变就直接用上次读好的（列文件那一步也省了）
let memo = null;
function memoKey(c, year) {
    const chars = c.characters.map(ch => `${ch.avatar}:${ch.date_last_chat}:${ch.chat_size}`).join('|');
    const groups = (c.groups || []).map(g => `${g.id}:${(g.chats || []).length}`).join('|');
    return `${year}#${c.getCurrentChatId?.() ?? ''}:${c.chat?.length ?? 0}#${chars}#${groups}`;
}
async function collect(year, opts) {
    const c = SillyTavern.getContext();
    const key = memoKey(c, year);
    if (memo?.key === key) return { chats: memo.chats, timing: { ...memo.timing, memo: true } };
    const r = await collectFresh(year, opts);
    memo = { key, ...r };
    return r;
}
async function collectFresh(year, { onProgress, signal }) {
    const c = SillyTavern.getContext();
    const headers = c.getRequestHeaders();
    const post = (url, body) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }).then(r => (r.ok ? r.json() : null));
    const yearStart = new Date(year, 0, 1).getTime();
    const user = c.getCurrentUserHandle?.() || 'default';
    const db = await openDb();

    // 先列出所有聊天文件，今年没碰过的不读。
    // 角色卡上带着聊天文件夹的大小和最后修改时间：没聊过、或者今年之前就没再动过的角色，连列都不用列
    const t0 = performance.now();
    const jobs = [];
    const chars = c.characters.filter(ch => !(ch.chat_size === 0 || (ch.date_last_chat > 0 && ch.date_last_chat < yearStart)));
    let listed = 0;
    const listQueue = chars.slice();
    async function lister() {
        while (listQueue.length) {
            if (signal.aborted) throw new DOMException('取消', 'AbortError');
            const ch = listQueue.shift();
            const list = await post('/api/characters/chats', { avatar_url: ch.avatar }).catch(e => { if (e.name === 'AbortError') throw e; return null; });
            onProgress(0, 0, ++listed, chars.length);
            if (Array.isArray(list)) addFiles(ch, list);
        }
    }
    const addFiles = (ch, list) => {
        for (const f of list) {
            const last = parseTime(f.last_mes);
            if (last && last < yearStart) continue;
            const id = String(f.file_name).replace(/\.jsonl$/, '');
            jobs.push({
                key: `${user}|c|${ch.avatar}|${id}`,
                sig: `${CACHE_V}|${f.file_size}|${f.chat_items}|${f.last_mes}`,
                owner: ch.avatar,
                chat: id,
                load: () => post('/api/chats/get', { ch_name: ch.name, file_name: id, avatar_url: ch.avatar }),
            });
        }
    };
    await Promise.all(Array.from({ length: 6 }, lister));
    const tList = performance.now();
    // 群聊没有「最后一条」的信息，每次都读（一般不多）
    for (const g of c.groups || []) {
        for (const id of g.chats || []) {
            jobs.push({ key: `${user}|g|${id}`, sig: null, owner: null, group: g.id, chat: id, load: () => post('/api/chats/group/get', { id }) });
        }
    }

    // 六个一起读
    const out = [];
    let done = 0, fetched = 0;
    const queue = jobs.slice();
    async function worker() {
        while (queue.length) {
            if (signal.aborted) throw new DOMException('取消', 'AbortError');
            const job = queue.shift();
            let years, fp;
            const hit = job.sig ? await dbGet(db, job.key) : null;
            if (hit && hit.sig === job.sig) ({ years, fp } = hit);
            else {
                const msgs = await job.load();
                fetched++;
                const list = Array.isArray(msgs) ? msgs : [];
                years = summarize(list, job.owner);
                fp = fingerprint(list);
                if (job.sig) dbPut(db, job.key, { sig: job.sig, years, fp });
            }
            out.push({ owner: job.owner, group: job.group, chat: job.chat, years, fp });
            onProgress(++done, jobs.length);
        }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    const now = performance.now();
    return { chats: out, timing: { chars: c.characters.length, listedChars: chars.length, files: jobs.length, fetched, listMs: Math.round(tList - t0), readMs: Math.round(now - tList), ms: Math.round(now - t0) } };
}

// ---------- 一年的总账 ----------
function tally(year, chats) {
    const c = SillyTavern.getContext();
    // 同一位角色（或同一个群）下指纹一样的聊天是备份副本：只留消息最多的那份
    const size = x => Object.values(x.years).reduce((p, Y) => p + Y.u + Y.a, 0);
    const keep = new Map();
    let copies = 0;
    for (const x of chats) {
        if (!x.fp) continue;
        const k = `${x.owner || x.group}|${x.fp}`;
        const was = keep.get(k);
        if (!was) { keep.set(k, x); continue; }
        copies++;
        if (size(x) > size(was)) keep.set(k, x);
    }
    const kept = new Set(keep.values());
    chats = chats.filter(x => !x.fp || kept.has(x));
    const n = daysInYear(year);
    const now = new Date();
    // 今年只排到今天
    const shown = year === now.getFullYear() ? dayOfYear(now) + 1 : n;
    const days = Array(n).fill(0);
    const uwDays = Array(n).fill(0);
    const hours = Array(24).fill(0);
    const who = {};
    const ownerDays = {};
    let u = 0, a = 0, uw = 0, first = null, longest = null, swipe = null, undated = 0, bigU = null;
    for (const x of chats) {
        const Y = x.years[year];
        if (!Y) continue;
        u += Y.u;
        a += Y.a;
        uw += Y.uw;
        undated += Y.undated || 0;
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
        if (Y.min && (!longest || len > longest.n)) longest = { n: len, min: Y.min, max: Y.max, owner: x.owner, group: x.group, chat: x.chat, days: Y.days };
        if (Y.swipe && (!swipe || Y.swipe.n > swipe.n)) swipe = Y.swipe;
        if (Y.bigU && (!bigU || Y.bigU.w > bigU.w)) bigU = { ...Y.bigU, owner: x.owner, group: x.group };
    }
    const peak = arr => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
    // 那一天字数最多的那场聊天
    const wd = peak(uwDays);
    let wordyBy = null;
    for (const x of chats) {
        const v = x.years[year]?.uwDays?.[wd] || 0;
        if (v && (!wordyBy || v > wordyBy.n)) wordyBy = { n: v, owner: x.owner, group: x.group };
    }
    const top = Object.entries(who)
        .map(([avatar, count]) => ({ avatar, count, name: c.characters.find(ch => ch.avatar === avatar)?.name }))
        .filter(x => x.name)
        .sort((p, q) => q.count - p.count);
    return {
        year, shown, days: days.slice(0, shown), uwDays: uwDays.slice(0, shown), hours,
        total: u + a, u, a, uw,
        active: days.filter(Boolean).length,
        busiest: { doy: peak(days), n: days[peak(days)] },
        wordiest: { doy: wd, n: uwDays[wd], by: wordyBy && whoIs(wordyBy.owner, wordyBy.group)?.name },
        top, first, longest, swipe, ownerDays, undated, copies,
        bigU: bigU && { ...bigU, by: whoIs(bigU.owner, bigU.group)?.name },
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
// share()：存图时画什么（没有就不能存；猜一猜不存，免得剧透）。图里只有数字、名字和头像，不带聊天原文
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
            <p class="npw-sub">底下这条波形是你的 ${s.year}：每一根是一天，越高那天聊得越多。${s.copies ? `<br>另有 ${s.copies} 份聊天是备份副本，没有重复算。` : ''}</p>`,
        wave: { data: s.days },
        share: () => ({ kicker: '酒馆年报', big: String(s.year), lines: [`这一年，我来了 ${fmt(s.active)} 天。`], wave: { data: s.days } }),
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
        share: () => ({ kicker: '这一年的消息', big: fmt(s.total), unit: '条', lines: [`我写了 ${fmt(s.u)} 条，角色们回了 ${fmt(s.a)} 条。`], wave: list.find(x => x.id === 'total').wave }),
    });
    const w = big(s.uw);
    list.push({
        id: 'words',
        tone: 'var(--np-cover-2)',
        html: `<div class="npw-k">你亲手写下的字</div>
            <div class="npw-num"><span data-count="${w.unit ? '' : s.uw}">${w.num}</span><small>${w.unit}字</small></div>
            <p class="npw-lead">${wordsLike(s.uw)}。</p>
            <p class="npw-sub">只算你自己发的消息，角色写的不算。${s.bigU?.w >= 50 ? `<br>最长的一条有 ${fmt(s.bigU.w)} 字${s.bigU.by ? `，写给 ${esc(s.bigU.by)}` : ''}${s.bigU.t ? `（${md(new Date(s.bigU.t))}）` : ''}。` : ''}</p>`,
        wave: { data: s.uwDays, line: s.wordiest.doy, note: `写得最多的一天 · ${md(dateOf(s.year, s.wordiest.doy))} · ${fmt(s.wordiest.n)} 字${s.wordiest.by ? `<br>大多在和${esc(s.wordiest.by)}聊` : ''}` },
        share: () => ({ kicker: '我亲手写下的字', big: w.num, unit: `${w.unit}字`, lines: [`${wordsLike(s.uw)}。`], wave: list.find(x => x.id === 'words').wave }),
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
            share: () => ({
                kicker: five.length > 1 ? `我的年度前${'一二三四五'[five.length - 1]}` : '我的年度角色',
                list: five.map(x => ({ avatar: x.avatar, name: x.name, sub: `${fmt(x.count)} 条消息` })),
                wave: { ...list.find(x => x.id === 'top').wave, note: `我和 ${no1.name} 的这一年` },
            }),
        });
    }

    // 时段人格：按你发消息的钟点
    const mine = s.hours.reduce((p, q) => p + q, 0);
    if (mine) {
        const win = bestWindow(s.hours);
        const sh = win.shift;
        const peakH = s.hours.indexOf(Math.max(...s.hours));
        const pct = Math.round((win.sum / mine) * 100);
        list.push({
            id: 'hours',
            tone: 'var(--np-cover-5)',
            html: `<div class="npw-k">你的时段人格</div>
                <div class="npw-name">${sh.name}</div>
                <p class="npw-lead">${sh.line}</p>
                <p class="npw-sub">你 <b>${pct}%</b> 的消息发在${hourName(win.from)}到${hourName(win.to)}之间，最常在${hourName(peakH)}出现。</p>`,
            dial: { hours: s.hours, win },
            share: () => ({ kicker: '我的时段人格', big: sh.name, lines: [sh.line, `${pct}% 的消息发在${hourName(win.from)}到${hourName(win.to)}之间。`], dial: { hours: s.hours, win } }),
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
            share: () => ({ kicker: '最纠结的一句', big: String(sw.n), unit: '版', lines: [`这条回复换了 ${sw.n} 版，我才留下它。`, `${swWho ? `来自 ${swWho.name} · ` : ''}${md(d)}`], wave: { data: s.days, line: dayOfYear(d) } }),
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
            share: () => ({
                kicker: '最长的一场', big: fmt(lg.n), unit: '条消息',
                lines: [`和 ${lgWho.name}，${m1 === m2 ? `在 ${m1} 月里一口气聊完。` : `从 ${m1} 月聊到 ${m2} 月。`}`, `这一场里，有 ${Object.keys(lg.days).length} 天我们在说话。`],
                wave: { data: s.days, hi: daySet(lg.days), note: '这一场在这一年里的位置' },
            }),
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
            share: () => ({
                kicker: '今年的第一句话', big: `${d.getMonth() + 1}月${d.getDate()}日`, unit: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                cover: fw.avatar, lines: [`是对 ${fw.name} 说的。`], wave: { data: s.days, line: dayOfYear(d) },
            }),
        });
    }

    // 角色写回忆（可选）：点了按钮、看过要发什么、再点「发送」，才用你现在连着的 API
    if (no1) {
        const mem = { state: 'idle', text: '', err: '' };
        const prompt = memoryPrompt(s, no1);
        const paint = (box, ui) => {
            const btn = (cls, label) => `<button class="npw-btn ${cls}" type="button">${label}</button>`;
            box.innerHTML = {
                idle: `<p class="npw-sub">会用你在酒馆里现在连着的 API 写一段。不点就不会发送任何东西。</p>${btn('npw-ask', '请 TA 写一段')}`,
                confirm: `<p class="npw-sub">下面这些会发给你现在连着的 API（约 ${fmt(prompt.system.length + prompt.user.length)} 字）：</p>
                    <pre class="npw-pre">${esc(`${prompt.system}\n\n${prompt.user}`)}</pre>
                    <div class="npw-btns">${btn('npw-send', '发送')}${btn('npw-cancel2', '算了')}</div>`,
                busy: '<p class="npw-lead npw-busy">正在写…</p>',
                done: `<blockquote class="npw-quote npw-memo">${esc(mem.text)}</blockquote><div class="npw-btns">${btn('npw-ask', '再写一版')}</div>`,
                error: `<p class="npw-sub">没写成：${esc(mem.err)}。检查一下酒馆的 API 连接，再试一次。</p>${btn('npw-ask', '再试一次')}`,
            }[mem.state];
            const on = (sel, fn) => box.querySelector(sel)?.addEventListener('click', e => { e.stopPropagation(); fn(); });
            on('.npw-ask', () => { mem.state = 'confirm'; paint(box, ui); });
            on('.npw-cancel2', () => { mem.state = mem.text ? 'done' : 'idle'; paint(box, ui); });
            on('.npw-send', async () => {
                mem.state = 'busy';
                paint(box, ui);
                try {
                    const out = await SillyTavern.getContext().generateRaw({ systemPrompt: prompt.system, prompt: prompt.user, responseLength: 500 });
                    // 去掉表示动作的 *星号*，只留字
                    mem.text = String(out || '').replace(/\*+/g, '').trim();
                    if (!mem.text) throw new Error('API 返回了空白');
                    mem.state = 'done';
                } catch (e) {
                    mem.err = e?.message || String(e);
                    mem.state = 'error';
                }
                ui.refresh('memory');
            });
        };
        list.push({
            id: 'memory',
            tone: h.color(no1.avatar),
            html: `<div class="npw-k">角色写回忆</div>
                <div class="npw-who">${h.cover(no1.avatar, true)}<p class="npw-lead">想听 <b>${esc(no1.name)}</b> 说说你们的这一年吗？</p></div>
                <div class="npw-mem"></div>`,
            mount(card, ui) { paint(card.querySelector('.npw-mem'), ui); },
            share: () => (mem.text ? { kicker: `${no1.name} 写给我的回忆`, cover: no1.avatar, quote: mem.text } : null),
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
            <div class="npw-btns"><button class="npw-btn npw-save-end" type="button">存这一张</button><button class="npw-btn npw-save-all" type="button">全部拼成长图</button></div>`,
        wave: { data: s.days },
        mount(card, ui) {
            card.querySelector('.npw-save-end').addEventListener('click', e => { e.stopPropagation(); ui.save(); });
            card.querySelector('.npw-save-all').addEventListener('click', e => { e.stopPropagation(); ui.saveAll(e.currentTarget); });
        },
        share: () => ({
            kicker: `我的 ${s.year} 酒馆`,
            grid: [['来了', fmt(s.active), '天'], ['消息', s.total < 1e5 ? fmt(s.total) : big(s.total).num, s.total < 1e5 ? '条' : '万条'], ['写下', w.num, `${w.unit}字`], ['时段人格', shName, '']],
            covers: top.slice(0, 3).map(x => ({ avatar: x.avatar, name: x.name })),
            wave: { data: s.days },
        }),
    });
    return list;
}

// 回忆卡发给 API 的话：角色设定（替换掉 {{char}} {{user}}）+ 你们这一年的几个数字 + 一句要求
function memoryPrompt(s, no1) {
    const c = SillyTavern.getContext();
    const ch = c.characters.find(x => x.avatar === no1.avatar) || {};
    const name = no1.name, user = c.name1 || '你';
    const fill = t => String(t || '').replace(/\{\{char\}\}/gi, name).replace(/\{\{user\}\}/gi, user).trim();
    const desc = fill(ch.description || ch.data?.description).slice(0, 1500);
    const pers = fill(ch.personality || ch.data?.personality).slice(0, 300);
    const days = Object.keys(s.ownerDays[no1.avatar] || {}).length;
    const facts = [`这一年（${s.year} 年），你和${user}一共聊了 ${fmt(no1.count)} 条消息，有 ${days} 天在一起说话。`];
    if (s.longest?.owner === no1.avatar) {
        const m1 = new Date(s.longest.min).getMonth() + 1, m2 = new Date(s.longest.max).getMonth() + 1;
        facts.push(m1 === m2 ? `你们聊得最长的一场在 ${m1} 月，有 ${fmt(s.longest.n)} 条消息。` : `你们聊得最长的一场从 ${m1} 月一直到 ${m2} 月，有 ${fmt(s.longest.n)} 条消息。`);
    }
    return {
        system: [`你是${name}。`, desc && `下面是你的设定：\n${desc}`, pers && `性格：${pers}`].filter(Boolean).join('\n'),
        user: `${facts.join('')}\n请用${name}自己的口吻和说话习惯，对${user}写一段一百五十字左右的年终回忆。可以提到这些数字，也可以只说感受。只写这段话本身，不要标题，不要旁白说明。`,
    };
}

// ---------- 音轨 ----------
// 像音频软件里的音轨：每天一根，以中线上下对称；底下一行月份刻度
// hi：哪些天点亮（其余压暗）；line：哪一天画一根播放头。label 是月份字号（存图时放大）
function paintWave(g, W, Ht, wave, year, t, ink, font, label = 11) {
    const { data, hi, line } = wave;
    const max = Math.max(1, ...data);
    const LABEL = label * 1.6;
    const H = Ht - LABEL;
    const mid = H / 2;
    const step = W / data.length;
    const bw = step > 2.5 ? step * .7 : Math.max(1, step);
    const dim = hi || line != null;
    g.fillStyle = ink;
    // 中线：没聊的日子也连着，像一条还没放到的轨道
    g.globalAlpha = .3;
    g.fillRect(0, mid - .5, W, Math.max(1, label / 11));
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
        const lw = Math.max(2, label / 5);
        g.globalAlpha = 1;
        g.fillRect(line * step + bw / 2 - lw / 2, 0, lw, H);
    }
    // 月份刻度
    g.globalAlpha = .9;
    g.font = `700 ${label}px ${font}`;
    g.textBaseline = 'bottom';
    for (let m = 0; m < 12; m++) {
        const doy = dayOfYear(new Date(year, m, 1));
        if (doy >= data.length) break;
        if (m % (W / label < 27 ? 3 : 2)) continue;
        g.fillText(`${m + 1}月`, doy * step, Ht);
    }
    g.globalAlpha = 1;
}

// ---------- 钟面 ----------
// 24 小时一圈，0 点在正上方；每小时一根往外长的条，你最常来的那三个小时亮，其余压暗
function paintDial(g, W, Ht, dial, t, ink, font, label = 12) {
    const cx = W / 2, cy = Ht / 2;
    const R = Math.min(cx, cy) - label * 1.4;
    const r0 = R * .34;
    const max = Math.max(1, ...dial.hours);
    g.fillStyle = g.strokeStyle = ink;
    g.globalAlpha = .3;
    g.lineWidth = Math.max(1, label / 12);
    g.beginPath();
    g.arc(cx, cy, r0, 0, Math.PI * 2);
    g.stroke();
    const span = Math.PI * 2 / 24;
    const gap = label / 4;
    for (let i = 0; i < 24; i++) {
        const len = (R - r0) * Math.sqrt(dial.hours[i] / max) * t;
        const a0 = -Math.PI / 2 + i * span + span * .12;
        const a1 = a0 + span * .76;
        g.globalAlpha = inWindow(i, dial.win) ? 1 : .38;
        g.beginPath();
        g.arc(cx, cy, r0 + gap + len, a0, a1);
        g.arc(cx, cy, r0 + gap, a1, a0, true);
        g.closePath();
        g.fill();
    }
    g.globalAlpha = .9;
    g.font = `700 ${label}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [0, 6, 12, 18].forEach(hh => {
        const a = -Math.PI / 2 + hh * span;
        g.fillText(String(hh), cx + Math.cos(a) * (r0 - label * 1.2), cy + Math.sin(a) * (r0 - label * 1.2));
    });
    g.textAlign = 'start';
    g.globalAlpha = 1;
}

// 网页里：按画布实际大小、清晰度画
function onCanvas(cv, paint) {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(cv);
    paint(g, r.width, r.height, css.getPropertyValue('--npw-ink').trim() || '#fff', css.fontFamily);
}
const drawWave = (cv, wave, year, t = 1) => onCanvas(cv, (g, W, H, ink, font) => paintWave(g, W, H, wave, year, t, ink, font));
const drawDial = (cv, dial, t = 1) => onCanvas(cv, (g, W, H, ink, font) => paintDial(g, W, H, dial, t, ink, font));

// ---------- 存成图片 ----------
// 1080×1920 竖图，直接在画布上画（不截网页）：标签、大数字、几行字、封面 / 排行 / 总结格子、底下音轨或钟面、落款
// art(头像) → 默认头像时给 { initial, color }，否则 null（画真头像）
async function renderShare(spec, year, art) {
    const W = 1080, H = 1920, P = 96;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    // 颜色和字体都从主题变量里取（用户在可改区改了，图也跟着变）
    const probe = document.createElement('div');
    probe.style.display = 'none';
    (document.getElementById('np_wrap') || document.body).append(probe);
    const resolve = v => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
    const base = spec.tone === 'base';
    const bg = resolve(base ? 'var(--np-panel)' : spec.tone);
    const fg = resolve(base ? 'var(--np-text)' : 'var(--np-on-art)');
    const sub = base ? resolve('var(--np-sub)') : fg;
    const ink = base ? resolve('var(--np-accent)') : fg;
    const onArt = resolve('var(--np-on-art)');
    const font = getComputedStyle(probe).fontFamily;
    await Promise.all(['900 200px', '800 60px', '700 40px', '500 40px'].map(f => document.fonts.load(`${f} ${font}`, '年报 2026').catch(() => {})));

    const loadImg = srcUrl => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = srcUrl; });
    const covers = {};
    const want = [spec.cover, ...(spec.list || []).map(x => x.avatar), ...(spec.covers || []).map(x => x.avatar)].filter(Boolean);
    await Promise.all(want.map(async av => {
        const gen = art?.(av);
        covers[av] = gen ? { gen: { initial: gen.initial, color: resolve(gen.color) } } : { img: await loadImg(`/characters/${encodeURIComponent(av)}`) };
    }));
    probe.remove();

    const setFont = (size, weight) => { g.font = `${weight} ${size}px ${font}`; };
    const say = (s, size, weight, x, y, color = fg) => { setFont(size, weight); g.fillStyle = color; g.fillText(s, x, y); return g.measureText(s).width; };
    // 中文逐字断行，英文单词不拆；句末标点不放到行首
    const wrapText = (s, max) => {
        const out = [];
        let cur = '';
        for (const tk of String(s).match(/[A-Za-z0-9][A-Za-z0-9,.'’:%~-]*|\s+|./gu) || []) {
            if (cur.trim() && g.measureText(cur + tk).width > max && !/^[，。、！？；：）」』…,.!?]/.test(tk)) { out.push(cur); cur = tk.trimStart(); } else cur += tk;
        }
        if (cur) out.push(cur);
        return out;
    };
    const drawCover = (av, x, y, sz) => {
        const c = covers[av] || {};
        g.save();
        g.beginPath();
        g.roundRect(x, y, sz, sz, sz * .04);
        g.clip();
        if (c.gen) {
            g.fillStyle = c.gen.color;
            g.fillRect(x, y, sz, sz);
            setFont(sz * .52, 900);
            g.fillStyle = onArt;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(c.gen.initial, x + sz / 2, y + sz / 2 + sz * .02);
        } else if (c.img) {
            const k = Math.max(sz / c.img.naturalWidth, sz / c.img.naturalHeight);
            const dw = c.img.naturalWidth * k, dh = c.img.naturalHeight * k;
            g.drawImage(c.img, x + (sz - dw) / 2, y + (sz - dh) * .18, dw, dh);
        } else {
            g.fillStyle = sub;
            g.globalAlpha = .2;
            g.fillRect(x, y, sz, sz);
        }
        g.restore();
    };

    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic';
    let y = P + 44;
    say(spec.kicker, 42, 700, P, y);
    y += 40;

    if (spec.big) {
        const cjk = /[㐀-鿿]/.test(spec.big);
        let size = cjk ? 160 : 240;
        const unitSize = 72;
        const width = () => {
            setFont(size, 900);
            const bw = g.measureText(spec.big).width;
            setFont(unitSize, 800);
            return bw + (spec.unit ? g.measureText(spec.unit).width + 28 : 0);
        };
        while (width() > W - 2 * P && size > 60) size -= 6;
        y += size * .92;
        const bw = say(spec.big, size, 900, P - size * .03, y);
        if (spec.unit) say(spec.unit, unitSize, 800, P + bw + 28, y);
        y += 36;
    }
    if (spec.cover) {
        y += 20;
        drawCover(spec.cover, P, y, 280);
        y += 280 + 30;
    }
    (spec.lines || []).forEach((line, i) => {
        const size = i ? 40 : 58;
        setFont(size, i ? 500 : 700);
        for (const l of wrapText(line, W - 2 * P)) {
            y += size * 1.45;
            say(l, size, i ? 500 : 700, P, y, i ? sub : fg);
        }
        y += i ? 6 : 14;
    });
    if (spec.list) {
        y += 30;
        spec.list.forEach((x, i) => {
            const sz = i ? 112 : 196;
            say(String(i + 1), 64, 900, P, y + sz / 2 + 22);
            drawCover(x.avatar, P + 84, y, sz);
            const tx = P + 84 + sz + 32;
            setFont(i ? 50 : 66, 800);
            let name = x.name;
            while (g.measureText(name).width > W - P - tx && name.length > 1) name = name.slice(0, -1);
            if (name !== x.name) name = `${name.slice(0, -1)}…`;
            say(name, i ? 50 : 66, 800, tx, y + sz / 2 - (i ? 2 : 8));
            say(x.sub, 36, 500, tx, y + sz / 2 + (i ? 46 : 50), sub);
            y += sz + 28;
        });
    }
    if (spec.grid) {
        y += 40;
        const colW = (W - 2 * P - 48) / 2;
        spec.grid.forEach(([label, value, unit], i) => {
            const x = P + (i % 2) * (colW + 48);
            const yy = y + Math.floor(i / 2) * 230;
            say(label, 36, 700, x, yy + 40, sub);
            const cjk = /[㐀-鿿]/.test(value);
            const vw = say(value, cjk ? 76 : 120, 900, x, yy + (cjk ? 150 : 165));
            if (unit) say(unit, 44, 700, x + vw + 14, yy + 165);
        });
        y += Math.ceil(spec.grid.length / 2) * 230;
    }
    if (spec.covers?.length) {
        y += 30;
        const sz = (W - 2 * P - 72) / 3;
        spec.covers.forEach((x, i) => {
            const cx = P + i * (sz + 36);
            drawCover(x.avatar, cx, y, sz);
            const rw = say(String(i + 1), 42, 800, cx, y + sz + 60, ink);
            setFont(42, 700);
            let name = x.name;
            while (g.measureText(name).width > sz - rw - 14 && name.length > 1) name = name.slice(0, -1);
            say(name === x.name ? name : `${name.slice(0, -1)}…`, 42, 700, cx + rw + 14, y + sz + 60);
        });
        y += sz + 90;
    }
    if (spec.quote) {
        y += 30;
        setFont(46, 500);
        const lines = wrapText(spec.quote.replace(/\s*\n\s*/g, ' '), W - 2 * P - 48).slice(0, 16);
        g.fillStyle = fg;
        g.fillRect(P, y + 10, 6, lines.length * 46 * 1.6 + 10);
        lines.forEach((l, i) => say(l, 46, 500, P + 40, y + 46 + i * 46 * 1.6));
        y += lines.length * 46 * 1.6 + 40;
    }

    // 底下的音轨 / 钟面，落款
    const foot = H - P + 14;
    if (spec.wave) {
        const top = foot - 80 - 520;
        if (spec.wave.note) {
            // 卡片上的说明是 HTML，画布上要纯文字；太长就往上折行
            const t = document.createElement('textarea');
            setFont(38, 700);
            const ls = spec.wave.note.split(/<br\s*\/?>/).flatMap(part => { t.innerHTML = part.replace(/<[^>]*>/g, ''); return wrapText(t.value, W - 2 * P); });
            ls.forEach((l, i) => say(l, 38, 700, P, top - 24 - (ls.length - 1 - i) * 52));
        }
        g.save();
        g.translate(P, top);
        paintWave(g, W - 2 * P, 520, spec.wave, year, 1, ink, font, 30);
        g.restore();
    } else if (spec.dial) {
        const top = Math.max(y + 20, foot - 80 - 760);
        g.save();
        g.translate(P, top);
        paintDial(g, W - 2 * P, foot - 70 - top, spec.dial, 1, ink, font, 32);
        g.restore();
    }
    g.textBaseline = 'alphabetic';
    say(`正在播放 · 酒馆年报 ${year}`, 32, 700, P, foot, sub);
    return cv;
}

// 所有能存图的卡拼成一张长图：每张缩到 540×960，两列，卡之间留缝
async function renderAll(specs, year, art) {
    const CW = 540, CH = 960, GAP = 24, PAD = 48, COLS = 2;
    const rows = Math.ceil(specs.length / COLS);
    const cv = document.createElement('canvas');
    cv.width = PAD * 2 + CW * COLS + GAP * (COLS - 1);
    cv.height = PAD * 2 + CH * rows + GAP * (rows - 1);
    const g = cv.getContext('2d');
    const probe = document.createElement('div');
    probe.style.display = 'none';
    (document.getElementById('np_wrap') || document.body).append(probe);
    const resolve = v => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
    g.fillStyle = resolve('var(--np-base)');
    g.fillRect(0, 0, cv.width, cv.height);
    const at = i => [PAD + (i % COLS) * (CW + GAP), PAD + Math.floor(i / COLS) * (CH + GAP)];
    for (let i = 0; i < specs.length; i++) {
        const one = await renderShare(specs[i], year, art);
        const [x, y] = at(i);
        g.save();
        g.beginPath();
        g.roundRect(x, y, CW, CH, 20);
        g.clip();
        g.drawImage(one, x, y, CW, CH);
        g.restore();
    }
    if (specs.length % COLS) {
        const [x, y] = at(specs.length);
        g.fillStyle = resolve('var(--np-sub)');
        g.font = `700 30px ${getComputedStyle(probe).fontFamily}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`正在播放 · 酒馆年报 ${year}`, x + CW / 2, y + CH / 2);
    }
    probe.remove();
    return cv;
}

function download(cv, name, type = 'image/png') {
    return new Promise((res, rej) => cv.toBlob(blob => {
        if (!blob) return rej(new Error('图片太大，浏览器画不出来'));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        res();
    }, type, .92));
}

// ---------- 界面 ----------
let current = null;

export function close() {
    current?.();
    current = null;
}

// helpers：{ colorOf(头像) → Promise<颜色>, cover(头像, 大不大) → 封面 HTML, art(头像) → 默认头像的 { initial, color } }
// （companion.js 提供，默认头像会画成首字封面）
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
            <button class="npw-save" type="button" title="存成图片" aria-label="存成图片" hidden></button>
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
    const tStart = performance.now();
    const secs = () => { const s = Math.round((performance.now() - tStart) / 1000); return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`; };
    const onProgress = (done, total, listed, chars) => {
        if (listed != null) { count.textContent = `列聊天文件 ${listed} / ${chars} 位角色 · ${secs()}`; prog.style.width = `${(listed / chars) * 15}%`; return; }
        count.textContent = `读了 ${done} / ${total} 个聊天 · ${secs()}`;
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
        it.mount?.(card, ui);
        saveBtn.hidden = !it.share?.();
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

    const saveBtn = wrap.querySelector('.npw-save');
    async function save() {
        const it = list[at];
        const spec = it?.share?.();
        if (!spec || saveBtn.disabled) return;
        saveBtn.disabled = true;
        try {
            await download(await renderShare({ tone: it.tone, ...spec }, year, helpers.art), `酒馆年报-${year}-${it.id}.png`);
            toastr?.success?.('已存成图片');
        } catch (e) {
            console.error('[正在播放] 存图失败', e);
            toastr?.error?.(`存图失败：${e?.message || e}`);
        } finally {
            saveBtn.disabled = false;
        }
    }
    saveBtn.addEventListener('click', save);
    // 拼成一张长图（JPG：十来张卡拼起来 PNG 太大）
    let stitching = false;
    async function saveAll(btn) {
        if (stitching) return;
        stitching = true;
        const label = btn?.textContent;
        if (btn) btn.textContent = '正在拼…';
        try {
            const specs = list.map(it => { const sp = it.share?.(); return sp && { tone: it.tone, ...sp }; }).filter(Boolean);
            await download(await renderAll(specs, year, helpers.art), `酒馆年报-${year}-全部.jpg`, 'image/jpeg');
            toastr?.success?.(`已把 ${specs.length} 张拼成一张长图`);
        } catch (e) {
            console.error('[正在播放] 拼图失败', e);
            toastr?.error?.(`拼图失败：${e?.message || e}`);
        } finally {
            stitching = false;
            if (btn) btn.textContent = label;
        }
    }
    // 卡片里的交互用：refresh 重画某张卡（还停在那张时）；save 存当前这张；saveAll 全部拼成长图
    const ui = { refresh: id => { if (list[at]?.id === id) show(at); }, save, saveAll };

    const go = d => { if (list.length) show(at + d); };
    wrap.querySelector('.npw-prev').addEventListener('click', () => go(-1));
    wrap.querySelector('.npw-next').addEventListener('click', () => go(1));
    wrap.querySelector('.npw-close').addEventListener('click', () => close());
    // 年报开着时，方向键 / 空格 / Esc 都归年报，不让酒馆拿去换版回复（swipe）或关面板
    const onKey = e => {
        const k = { Escape: 0, ArrowRight: 1, ' ': 1, ArrowLeft: -1 }[e.key];
        if (k === undefined || e.target.closest?.('textarea, input, [contenteditable="true"]')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (k === 0) close(); else go(k);
    };
    addEventListener('keydown', onKey, true);
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
        removeEventListener('keydown', onKey, true);
        removeEventListener('resize', onResize);
        wrap.remove();
    };

    collect(year, { onProgress, signal: ac.signal })
        .then(async ({ chats, timing }) => {
            if (ac.signal.aborted) return;
            const s = tally(year, chats);
            // 调试用：npWrapped.share('top') 拿到某张卡的存图（data URL）
            window.npWrapped = {
                stats: s, timing,
                all: async () => (await renderAll(list.map(it => { const sp = it.share?.(); return sp && { tone: it.tone, ...sp }; }).filter(Boolean), year, helpers.art)).toDataURL('image/jpeg', .92),
                share: async id => { const it = list.find(x => x.id === id); const spec = it?.share?.(); return spec ? (await renderShare({ tone: it.tone, ...spec }, year, helpers.art)).toDataURL('image/png') : null; },
            };
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
