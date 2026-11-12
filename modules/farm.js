// 农场对话框 · 主题伴侣附带的脚本（用这套主题时载入，换走时清理）
// 1. 日历时钟：聊天区右边挂一块板（右边面板钉住时挂左边）—— 左边大半个圆的表盘（一圈天色，金色指针从早上六点朝下转到晚上朝上）、
//    右边三格：星期和日期、季节和昼夜两个小图标、时间；底下用两根小棍吊着一块计数牌：这个聊天一共几楼。
// 2. 体力条 = 上下文用了多少：最近一次发出去的提示词有多少词符 / 上限（默认 200000，主题设置里改；填 0 跟酒馆的上下文长度）。
//    电脑竖着挂在聊天区旁边，手机横着贴在输入框上沿。
// 3. 排版：主题设置里选「木板分栏」时给 <html> 写 data-sv-layout="board"（默认「铺满」：不要木板那一栏，字绕着头像铺满）。
// 4. 生成中：<html> 加 sv-gen，最后一条角色消息右下角出现一只一上一下跳的小箭头。
// 5. 好感心心：每条角色消息的名牌下面一排十颗心，点一下改，按角色名存在酒馆设置里（extension_settings.farm_hearts）。
// 6. 头像「清晰原图」：把聊天里的头像缩略图换成原图（样式那边同时把像素放大关掉）。
// 时钟和体力条是脚本画的像素画（SVG，一格一个「像素」，颜色全用主题变量；格子大小 = --sv-p）。
// 没装扩展就没有这些（只有主题本身的样子）。

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
const SEASON_NAME = { spring: '春', summer: '夏', fall: '秋', winter: '冬' };
const HEARTS = 10;

// ---------------- 像素画 ----------------
const V = n => `var(--sv-${n})`;
const MIX = (a, b, pct) => `color-mix(in srgb, ${a}, ${b} ${pct}%)`;
const O = V('outline'), F = V('frame'), BR = V('frame-br'), LO = V('frame-lo'), DK = V('frame-dk');

// w×h 的格子，at(x, y) 返回颜色（CSS 颜色字符串）或 null（透明）。同一行连着的同色格合成一条
function pix(w, h, at, cls = '') {
    let out = '';
    for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w; x++) row.push(at(x, y));
        for (let x = 0; x < w;) {
            const c = row[x];
            let n = 1;
            while (x + n < w && row[x + n] === c) n++;
            if (c) out += `<rect x="${x}" y="${y}" width="${n}" height="1" style="fill:${c}"/>`;
            x += n;
        }
    }
    return `<svg class="sv-pix ${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" style="width:calc(var(--sv-p) * ${w});height:calc(var(--sv-p) * ${h})">${out}</svg>`;
}

// 一块凸起的橙色木板：四角各缺一格，描边一圈，里面左上亮、右下暗
function plank(x, y, w, h) {
    const r = x === w - 1, b = y === h - 1;
    if ((x === 0 || r) && (y === 0 || b)) return null;
    if (x === 0 || y === 0 || r || b) return O;
    if (y === 1 || x === 1) return BR;
    if (y === h - 2 || x === w - 2) return LO;
    return F;
}

// 嵌在木板里的一格米色框：深色边，里面左上一道阴影
function field(x, y, w, h) {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return DK;
    if (x === 1 || y === 1) return V('scroll-edge');
    return V('scroll');
}

// 时钟：左边大半个圆的表盘（圆心在木板左边缘往里一点，露出六成多）+ 右边一块有厚度的木板（三格，格子是凹进去的）
// 表盘背景是固定的一圈天色：朝下 = 清早，朝左 = 白天，朝上 = 夜里（月牙和星星）；金色指针指着现在几点
const CK = { W: 73, H: 40, R: 20, bx: 25 };
const STARS = [[18, 4], [22, 7], [13, 6], [21, 12], [10, 9]];
const TILES = [29, 58];      // 两个小图标格的左边（10×10，第 15~24 行）
function clockArt(hour) {
    const { W, H, R, bx } = CK;
    const BW = W - bx;
    // 天色：白天那边按高低一条条横着分；朝上偏右那一角是傍晚和夜里（按角度，0 = 朝下，1 = 朝上）
    const sky = (x, y) => {
        const dx = x + 0.5 - R, dy = y + 0.5 - R;
        const th = Math.atan2(-dx, dy);
        const k = Math.abs(th) / Math.PI;   // 圆心右边（露出来的那一小条）：下半是清早、上半是夜里
        if (k >= 0.82) return MIX(V('sky-dk'), O, 38);
        if (k >= 0.75) return MIX(V('sky-dk'), V('petal'), 35);
        if (k >= 0.69) return MIX(V('sky'), V('petal'), 45);
        if (y < 11) return V('sky');
        if (y < 18) return MIX(V('sky'), 'white', 22);
        if (y < 25) return MIX(V('sky'), 'white', 40);
        if (y < 31) return MIX(V('sky'), 'white', 58);
        return MIX(V('sun'), 'white', 50);
    };
    // 指针：早上 6 点朝下，中午朝左，晚上 8 点以后朝上（夜里停在朝上）；转轴就是表盘的圆心（木板盖住圆的右边一小半）
    const t = Math.min(1, Math.max(0, (hour - 6) / 14));
    const a = t * Math.PI;
    const vx = -Math.sin(a), vy = Math.cos(a), nx = -vy, ny = vx;
    const px = R, py = R;
    const L = 14;
    const hand = new Map();
    const put = (x, y, c) => { const k = `${Math.floor(x)},${Math.floor(y)}`; if (!hand.has(k) || c === V('sun')) hand.set(k, c); };
    for (let s = 1.5; s <= L - 4; s += 0.25) put(px + s * vx, py + s * vy, V('sun-dk'));
    for (let s = L - 5; s <= L; s += 0.2) {
        const w = (L - s) * 0.55;
        for (let o = -w; o <= w; o += 0.2) put(px + s * vx + o * nx, py + s * vy + o * ny, V('sun'));
    }
    const isHand = (x, y) => x < bx && hand.get(`${x},${y}`);
    const nearHand = (x, y) => isHand(x - 1, y) || isHand(x + 1, y) || isHand(x, y - 1) || isHand(x, y + 1);
    // 木板上一个凹进去的格子：深色边、里面左上一道阴影；格子下沿和右沿外面一道亮边（光从上面来）
    const hole = (x, y, x0, y0, w, h) => {
        if (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h) return field(x - x0, y - y0, w, h);
        if ((y === y0 + h && x > x0 && x <= x0 + w) || (x === x0 + w && y > y0 && y <= y0 + h)) return BR;
        return null;
    };
    const board = (x, y) => {
        const u = x - bx, v = y;
        const r = u === BW - 1, b = v === H - 1;
        // 圆角：四角各空两格
        if ((u === 0 || r) && (v === 0 || b)) return null;
        if ((u === 1 || u === BW - 2) && (v === 0 || b)) return null;
        if ((u === 0 || r) && (v === 1 || v === H - 2)) return null;
        if (u === 0 || v === 0 || r || b) return O;
        if ((u === 1 || u === BW - 2) && (v === 1 || v === H - 2)) return O;
        // 底边和右边是木板的厚度：暗两道
        if (v === H - 2 || u === BW - 2) return DK;
        if (v === H - 3 || u === BW - 3) return LO;
        if (v === 1 || u === 1) return BR;
        // 三格：日期（3~12 行）、两个小图标（15~24 行）、时间（27~36 行）；格子 28~68 列
        const f = hole(x, y, 28, 3, 41, 10) || hole(x, y, 28, 27, 41, 10);
        if (f) return f;
        for (const tx of TILES) {
            if (x >= tx && x < tx + 10 && y >= 15 && y < 25) {
                if (x === tx || x === tx + 9 || y === 15 || y === 24) return O;
                if (x === tx + 1 || y === 16) return MIX(V('sky'), 'white', 15);
                return MIX(V('sky'), 'white', 45);
            }
            if ((y === 25 && x > tx && x <= tx + 10) || (x === tx + 10 && y > 15 && y <= 25)) return BR;
        }
        // 中间一块凸起的小牌子，刻两道横线
        if (x >= 44 && x <= 52 && y >= 16 && y <= 23) {
            const c = plank(x - 44, y - 16, 9, 8);
            if (c && (y === 18 || y === 21) && x >= 46 && x <= 50) return DK;
            if (c) return c;
        }
        return F;
    };
    return pix(W, H, (x, y) => {
        // 转轴：圆心一颗小钉，外面一圈描边
        const ax = Math.abs(x + 0.5 - px), ay = Math.abs(y + 0.5 - py);
        if (ax <= 1 && ay <= 1) return x + 0.5 < px && y + 0.5 < py ? BR : DK;
        if (ax <= 2 && ay <= 2 && !(ax > 1.5 && ay > 1.5)) return O;
        // 指针盖在表盘上，外面一圈描边
        const hc = isHand(x, y);
        if (hc) return hc;
        if (x >= bx) return board(x, y);
        const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
        if (d > R) return null;
        if (nearHand(x, y) && d < R - 4.9) return O;
        // 表盘：粗描边 | 亮橙 | 橙 | 暗橙 | 描边
        const e = R - d;
        if (e < 1.3) return O;
        if (e < 2.2) return BR;
        if (e < 3.1) return F;
        if (e < 4.0) return LO;
        if (e < 4.9) return O;
        // 夜里那一角：星星和月牙
        if (STARS.some(([sx, sy]) => sx === x && sy === y)) return V('snow');
        const m1 = Math.hypot(x + 0.5 - 15.5, y + 0.5 - 12.5), m2 = Math.hypot(x + 0.5 - 17, y + 0.5 - 11.3);
        if (m1 < 2.9 && m2 >= 2.4) return V('moon');
        // 白天那边一个太阳；清早那边一个刚冒头的小太阳
        const sd = Math.hypot(x + 0.5 - 9, y + 0.5 - 20);
        if (sd < 1.6) return MIX(V('sun'), 'white', 60);
        if (sd < 3.1) return V('sun');
        const sr = Math.hypot(x + 0.5 - 14, y + 0.5 - 33.5);
        if (sr < 2.4) return MIX(V('sun'), V('sun-dk'), 30);
        return sky(x, y);
    }, 'sv-clock-art');
}

// 计数牌：上面两根小棍吊着，药丸形的板，左边「楼」字，右边五格数字
const CT = { W: 40, H: 16 };
function countArt() {
    const { W, H } = CT, top = 3, ph = H - top;
    const inShape = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= ph) return false;
        const e = Math.min(y, ph - 1 - y), s = Math.min(x, W - 1 - x);
        return !(e === 0 && s < 2) && !(e === 1 && s < 1);
    };
    const edge = (x, y) => !inShape(x - 1, y) || !inShape(x + 1, y) || !inShape(x, y - 1) || !inShape(x, y + 1);
    return pix(W, H, (x, y) => {
        if (y < top) {
            if (x === 6 || x === W - 8) return O;
            if (x === 7 || x === W - 7) return DK;
            return null;
        }
        const yy = y - top;
        if (!inShape(x, yy)) return null;
        if (edge(x, yy)) return O;
        // 数字格：x 11..37，yy 2..10；每 5 格一道竖线
        if (x >= 11 && x <= W - 3 && yy >= 2 && yy <= 10) {
            const fx = x - 11, fy = yy - 2;
            if (fx === 0 || fy === 0 || x === W - 3 || fy === 8) return DK;
            if (fy === 1) return V('scroll-edge');
            if (fx % 5 === 0 && fx > 0) return MIX(V('scroll'), V('scroll-edge'), 70);
            return V('scroll');
        }
        if (edge(x, yy - 1) && yy <= ph / 2) return BR;
        if (edge(x, yy + 1) && yy > ph / 2) return DK;
        if (edge(x, yy + 2) && yy > ph / 2) return LO;
        return F;
    }, 'sv-count-art');
}

// 体力条：顶上一个帽子写着 E，下面一根槽；vertical = 竖着（电脑），否则横着（手机，帽子在左）
const EN = { T: 12, cap: 11 };
const E_GLYPH = ['####', '#...', '###.', '#...', '####'];
function energyArt(vertical, len) {
    const { T, cap } = EN;
    const W = vertical ? T : len, H = vertical ? len : T;
    const [gx, gy] = vertical ? [4, 3] : [3, 3];
    const glyph = (x, y) => {
        const r = E_GLYPH[y - gy];
        return r && r[x - gx] === '#';
    };
    const nearGlyph = (x, y) => {
        // 字外面一圈深色，四个角各空一格（圆一点）
        const cx = x === gx - 1 || x === gx + 4, cy = y === gy - 1 || y === gy + 5;
        if (cx && cy) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (glyph(x + dx, y + dy)) return true;
        return false;
    };
    return pix(W, H, (x, y) => {
        // u = 横截面方向（0..T-1），v = 长度方向
        const u = vertical ? x : y, v = vertical ? y : x;
        const ue = u === 0 || u === T - 1, ve = v === 0 || v === len - 1;
        if (ue && ve) return null;
        if (ue || ve) return O;
        if (v < cap) {
            if (glyph(x, y)) return y === gy ? MIX(V('sun'), 'white', 40) : V('sun');
            if (nearGlyph(x, y)) return O;
            if (v === cap - 1) return O;
            if (v === 1 || u === 1) return BR;
            if (u === T - 2 || v === cap - 2) return LO;
            return F;
        }
        if (u === 1 || u === T - 2) return F;
        if (u === 2 || u === T - 3 || v === cap || v === len - 2) return LO;
        return MIX(O, DK, 30);
    }, 'sv-energy-art');
}

export default function farm(api) {
    const opt = (k, d) => { try { return api?.get?.(k) ?? d; } catch { return d; } };
    const ctx = () => window.SillyTavern?.getContext?.();
    const root = document.documentElement;
    const offs = [];   // 清理时要做的事

    // ---------------- 日历时钟 ----------------
    const box = document.createElement('div');
    box.id = 'sv_clock';
    box.innerHTML = `
        <div class="sv-face">
            <span class="sv-art"></span>
            <div class="sv-date"></div>
            <i class="sv-ico sv-season"></i><i class="sv-ico sv-daynight"></i>
            <div class="sv-time"></div>
        </div>
        <div class="sv-count" title="这个聊天一共几楼"><span class="sv-art">${countArt()}</span><b>楼</b><span class="sv-num"></span></div>`;
    document.body.append(box);
    offs.push(() => box.remove());

    const $art = box.querySelector('.sv-face .sv-art');
    const $date = box.querySelector('.sv-date');
    const $time = box.querySelector('.sv-time');
    const $count = box.querySelector('.sv-num');
    const $season = box.querySelector('.sv-season');
    const $dn = box.querySelector('.sv-daynight');

    let lastArt = '';
    function tick() {
        const d = new Date();
        const h = d.getHours(), m = d.getMinutes();
        const season = SEASON[d.getMonth()];
        const night = h < 6 || h >= 19;
        box.dataset.season = season;
        box.classList.toggle('sv-night', night);
        $season.title = SEASON_NAME[season] + '天';
        $dn.title = night ? '夜里' : '白天';
        $date.textContent = `${WEEK[d.getDay()]} ${d.getDate()}`;
        const h12 = h % 12 || 12;
        $time.textContent = `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
        // 指针每 10 分钟走一格就够了
        const key = `${h}|${Math.floor(m / 10)}`;
        if (key !== lastArt) {
            lastArt = key;
            $art.innerHTML = clockArt(h + Math.floor(m / 10) / 6);
        }
    }

    function count() {
        const chat = ctx()?.chat;
        $count.textContent = String(Array.isArray(chat) ? chat.length : 0);
    }

    // ---------------- 体力条（上下文用量） ----------------
    const bar = document.createElement('div');
    bar.id = 'sv_energy';
    bar.innerHTML = `<span class="sv-art"></span><i></i>`;
    const $barArt = bar.querySelector('.sv-art');
    const mq = matchMedia('(max-width: 1000px)');
    function placeBar() {
        const form = document.getElementById('form_sheld');
        const mobile = mq.matches && form;
        const len = mobile ? 60 : 70;
        bar.classList.toggle('sv-h', !!mobile);
        bar.style.setProperty('--sv-elen', String(len));
        $barArt.innerHTML = energyArt(!mobile, len);
        if (mobile) { if (bar.parentElement !== form) form.append(bar); }
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
        let used = 0, max = Number(opt('emax', 200000)) || 0;
        const own = max > 0;
        if (!own) {
            try { max = Number(st?.getMaxContextSize?.()) || Number(c?.maxContext) || 0; } catch { max = Number(c?.maxContext) || 0; }
        }
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
            ? `上下文：${used.toLocaleString()} / ${max.toLocaleString()} 词符（${Math.round(r * 100)}%）\n按最近一次发出去的提示词算；上限${own ? '在主题设置里改' : '跟酒馆的上下文长度'}`
            : '上下文用量：这个聊天还没发过消息（发一次就有了）';
    }
    let lastMax = opt('emax', 200000);

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

    // ---------------- 排版：铺满（默认）/ 木板分栏 ----------------
    // 旧版的季节配色撤掉了，用过的人 <html> 上可能还留着 data-sv-season，顺手清掉
    delete root.dataset.svSeason;
    function layout() {
        const v = ['board', 'plain'].includes(opt('layout', 'full')) ? opt('layout', 'full') : 'full';
        if (root.dataset.svLayout !== v) root.dataset.svLayout = v;
    }
    offs.push(() => { delete root.dataset.svLayout; });

    // ---------------- 背景：预设的像素天空 / 风景（图在扩展的 assets/farm/，tools/farm/backgrounds.py 生成） ----------------
    // 「跟着时间」：6~17 点晴空、17~19 点傍晚、其余星空；选「酒馆里选的背景」就不管，用户在背景面板挑图时伴侣也会自动切过去
    const BG = ['day', 'dusk', 'night', 'valley', 'beach'];
    const skyNow = () => { const h = new Date().getHours(); return h >= 6 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night'; };
    const clearBg = () => { delete root.dataset.svBg; root.style.removeProperty('--sv-bg-img'); };
    function background() {
        const pick = opt('bg', 'auto');
        const v = pick === 'auto' ? skyNow() : BG.includes(pick) ? pick : '';
        if (!v) { if (root.dataset.svBg) clearBg(); return; }
        if (root.dataset.svBg === v) return;
        let url;
        try { url = new URL(`../assets/farm/${v}.png`, import.meta.url).href; } catch { return; }
        root.style.setProperty('--sv-bg-img', `url("${url}")`);
        root.dataset.svBg = v;
    }
    offs.push(clearBg);

    // ---------------- 生成中 ----------------
    const genOn = (_type, _opts, dryRun) => { if (!dryRun) root.classList.add('sv-gen'); };
    const genOff = () => { root.classList.remove('sv-gen'); energy(); };
    offs.push(() => root.classList.remove('sv-gen'));

    // ---------------- 开始 ----------------
    const onChat = () => { count(); heartRules(); allHearts(); avatars(); setTimeout(energy, 300); };
    const onRender = () => { count(); allHearts(); avatars(); };
    tick();
    layout();
    background();
    onChat();
    const t1 = setInterval(tick, 20 * 1000);
    // 主题设置改了，一两秒内跟上
    const t2 = setInterval(() => {
        layout();
        background();
        avatars();
        const m = opt('emax', 200000);
        if (m !== lastMax) { lastMax = m; energy(); }
    }, 1500);
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
