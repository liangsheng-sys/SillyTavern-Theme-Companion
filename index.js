/*
 * 主题伴侣 —— SillyTavern 扩展
 * 作者：mangosagocreamwithpomelo（Discord）
 * 设计与实现：Claude Opus 5.5（Anthropic）
 *
 * 1. 附带的主题：themes/ 里的主题按「系列」登记在 themes.json（一个系列 = 主题本体 + 可选的几个变体）；变体也可以做成「主题设置」里的一个选项（如银盐显影的五种调色），只装一套。
 *    - 还没装过的：首次加载时直接存进酒馆（不弹窗），刷新后出现在主题列表
 *    - 装过旧版的：默认只提醒，不覆盖；打开「自动更新主题」才会覆盖
 * 2. 主题设置：每个系列在 themes.json 里声明自己的选项（换色、开关、文字……），
 *    这里把用户的选择写成一小段 CSS 盖在主题上。选项存在扩展设置里，主题更新后不会丢。
 * 3. 昼夜开关：给 <html> 加上 dn-day 或 dn-night 类，支持昼夜的主题据此换配色。
 *    不装本扩展时，这类主题跟随系统深浅色；装了以后由这里决定。
 *    - 手动切换、跟随系统，或按时间自动切换；切换时用浏览器的视图过渡，主题可以自定动画
 *    - 昼版纸张：选项由主题在 CSS 变量 --dn-papers 里提供
 *    - 魔杖菜单里有「切换昼 / 夜」「主题设置」；斜杠命令 /daynight day|night|auto|system|toggle
 * 4. 扩展自己的更新：面板里显示版本、检查更新、一键更新，可以打开自动更新（默认关）。
 * 5. 声音：系列可以带一段「回复写完」的音效（如苔庭的惊鹿），默认开；可调音量、换成自己电脑上的文件（存在浏览器里）。
 * 6. 主题脚本：系列可以带一小段自己的脚本（themes.json 里的 module，如 WPS文档 的可拖标尺），用这套主题时才载入。
 */

const KEY = 'daynight';
const CACHE = 'daynight:last';
const DEFAULTS = {
    mode: 'system', manual: null, dayStart: '07:00', dayEnd: '19:00', paper: 'default',
    themes: {},              // 主题名 → 装的版本（'manual' = 用户自己导入的，版本未知）
    opts: {},                // 系列名 → { 选项 → 值 }
    autoUpdateThemes: false,
    autoInstallNew: false,   // 自动安装新主题（1.11 起默认不装，由用户在列表里挑）
    autoUpdateExt: false,
    tryDrafts: false,        // 试用施工中的主题（默认不装、不列出）
};
const root = document.documentElement;

// 先套用上次的结果，避免加载时先闪一下夜版
try {
    const last = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (last) paint(last.day, last.paper, false);
    if (last?.css) setOptionCss(last.css);
} catch { /* 无痕模式等读不到也没关系 */ }

function ctx() {
    return SillyTavern.getContext();
}

function settings() {
    const all = ctx().extensionSettings;
    all[KEY] = Object.assign({}, DEFAULTS, all[KEY]);
    return all[KEY];
}

function save() {
    ctx().saveSettingsDebounced();
}

function remember(patch) {
    try {
        const last = JSON.parse(localStorage.getItem(CACHE) || '{}') || {};
        localStorage.setItem(CACHE, JSON.stringify({ ...last, ...patch }));
    } catch { /* 忽略 */ }
}

function stickyToast(text, title, onclick) {
    toastr.success(text, title, { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: true, onclick });
}

// ================================================================
// 昼夜
// ================================================================
function minutes(t) {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function isDaytime(s) {
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    const a = minutes(s.dayStart), b = minutes(s.dayEnd);
    return a <= b ? now >= a && now < b : now >= a || now < b;   // 支持跨午夜的区间
}

const systemLight = window.matchMedia('(prefers-color-scheme: light)');

function wantDay(s) {
    if (s.mode === 'auto') return isDaytime(s);
    if (s.mode === 'system') return systemLight.matches;
    return s.manual === 'day';
}

function themeVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim().replace(/^['"]|['"]$/g, '');
}

// 切换的一瞬间：颜色缓缓过渡，像开灯关灯（开启「减少动态效果」时不加）。
// 只在切换的那 0.7 秒里挂上：body * 这种规则平时也会让每个元素多试一次
const DN_SWITCH_CSS = `html.dn-switching body,
html.dn-switching body *,
html.dn-switching body *::before,
html.dn-switching body *::after {
    transition: background-color 0.5s ease, color 0.5s ease, border-color 0.5s ease, outline-color 0.5s ease, fill 0.5s ease !important;
}`;
function switchCss(on) {
    let el = document.getElementById('dn-switching-css');
    if (!on) { el?.remove(); return; }
    if (!el) {
        el = document.createElement('style');
        el.id = 'dn-switching-css';
        el.textContent = DN_SWITCH_CSS;
        document.head.append(el);
    }
}

function paint(day, paper, animate = true) {
    const changed = root.classList.contains('dn-day') !== day;
    const swap = () => {
        root.classList.toggle('dn-day', day);
        root.classList.toggle('dn-night', !day);
        if (paper && paper !== 'default') root.dataset.paper = paper;
        else delete root.dataset.paper;
        // 手机浏览器地址栏的颜色跟着变
        requestAnimationFrame(() => {
            const meta = document.querySelector('meta[name=theme-color]');
            const tint = themeVar('--SmartThemeBlurTintColor');
            if (meta && tint) meta.setAttribute('content', tint);
        });
    };
    if (animate && changed && !document.body?.classList.contains('reduced-motion')) {
        root.classList.add('dn-switching');
        switchCss(true);
        clearTimeout(paint.timer);
        paint.timer = setTimeout(() => { root.classList.remove('dn-switching'); switchCss(false); }, 700);
        // 用浏览器的视图过渡切换：默认是淡入淡出，主题可以用
        // :root[data-dn-to='day'|'night']::view-transition-new(root) 自己定动画（如「银盐显影」的开关灯）
        if (document.startViewTransition && document.visibilityState === 'visible') {
            root.dataset.dnTo = day ? 'day' : 'night';
            const vt = document.startViewTransition(swap);
            vt.finished.finally(() => { if (root.dataset.dnTo === (day ? 'day' : 'night')) delete root.dataset.dnTo; });
        } else swap();
    } else swap();
}

function apply(animate = true) {
    const s = settings();
    // 第一次装上时，「手动」从当前看到的样子（跟随系统的结果）开始，不突然跳变
    if (s.manual !== 'day' && s.manual !== 'night') { s.manual = systemLight.matches ? 'day' : 'night'; save(); }
    const day = wantDay(s);
    paint(day, s.paper, animate);
    remember({ day, paper: s.paper });
    syncUi();
}

function setMode(cmd) {
    const s = settings();
    const isDay = root.classList.contains('dn-day');
    if (cmd === 'auto' || cmd === 'system') s.mode = cmd;
    else {
        s.mode = 'manual';
        s.manual = cmd === 'toggle' ? (isDay ? 'night' : 'day') : cmd;
    }
    save();
    apply();
}

// ================================================================
// 附带的主题
// ================================================================
const HERE = new URL('.', import.meta.url);
let families = [];   // themes/themes.json：[{ family, version, variantLabel, options, themes: [{ name, file, label }] }]

async function loadBundled() {
    try {
        const r = await fetch(new URL('themes/themes.json', HERE), { cache: 'no-cache' });
        families = r.ok ? (await r.json()).filter(f => f.family && Array.isArray(f.themes)) : [];
    } catch { families = []; }
}

async function themeText(t) {
    const r = await fetch(new URL(`themes/${encodeURIComponent(t.file)}`, HERE), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`读不到 ${t.file}`);
    return r.text();
}

// 直接存进酒馆的主题文件夹（和「另存主题」同一个接口，不弹窗）；酒馆只在启动时读主题列表，所以要刷新才出现
// 这次加载里新存进去的主题：酒馆的主题列表要刷新页面才有它们，现在选它也套不上
const savedNow = new Set();
async function saveTheme(t) {
    try {
        const r = await fetch('/api/themes/save', { method: 'POST', headers: ctx().getRequestHeaders(), body: await themeText(t) });
        if (r.ok) savedNow.add(t.name);
        return r.ok;
    } catch (e) {
        console.warn('[主题伴侣] 保存主题失败', t.name, e);
        return false;
    }
}

// 读酒馆里已存的主题（接口顺带返回整份设置，比较重，一次加载最多读一次）
let savedThemes;
function serverThemes() {
    savedThemes ||= fetch('/api/settings/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: '{}' })
        .then(r => r.json()).then(d => d.themes || []);
    return savedThemes;
}

async function sameAsBundled(t) {
    try {
        const mine = (await serverThemes()).find(x => x.name === t.name);
        const ours = JSON.parse(await themeText(t));
        return !!mine && mine.custom_css === ours.custom_css;
    } catch {
        return false;
    }
}

// TauriTavern 在「用户设置」抽屉关着时会把里面的 DOM（含 #themes）整块摘下来，这时改用后台的主题列表
let serverNames = null;   // 后台的主题名（只在 #themes 不在页面上时用）
async function loadServerNames() {
    if (document.getElementById('themes')) return;
    try { serverNames = new Set((await serverThemes()).map(x => x.name)); } catch { serverNames = null; }
}

function installedNames() {
    const sel = document.getElementById('themes');
    if (sel || !serverNames) return new Set([...(sel?.options || [])].map(o => o.value));
    return new Set(serverNames);
}

function currentTheme() {
    return ctx().powerUserSettings?.theme ?? $('#themes').val();
}

function currentFamily() {
    const name = currentTheme();
    return families.find(f => f.themes.some(t => t.name === name));
}

function isVersion(v) {
    return /^\d/.test(v || '');
}

function newer(a, b) {   // a 比 b 新？
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
}

// 已装、但不是这个版本（版本未知的也算）
function isStale(fam, rec) {
    return !isVersion(rec) || newer(fam.version, rec);
}

function familyState(fam) {
    const have = installedNames();
    const rec = settings().themes;
    const installed = fam.themes.filter(t => have.has(t.name));
    return {
        installed,
        missing: fam.themes.filter(t => !have.has(t.name)),
        stale: installed.filter(t => isStale(fam, rec[t.name])),
        using: fam.themes.some(t => t.name === currentTheme()),
    };
}

function refreshToast(title) {
    stickyToast('点这里刷新页面后生效', title, () => location.reload());
}

// 一次装几套（列表里勾选的）
async function installMany(fams) {
    let ok = 0;
    for (const fam of fams) {
        for (const t of familyState(fam).missing) if (await saveTheme(t)) { settings().themes[t.name] = fam.version; ok++; }
    }
    save();
    if (ok) refreshToast(`已安装${fams.map(f => `「${f.family}」`).join('')}`);
    else toastr.error('保存失败，请检查酒馆是否在运行', '主题伴侣');
    syncThemes();
}

async function installFamily(fam, list = familyState(fam).missing) {
    const done = [];
    for (const t of list) if (await saveTheme(t)) { settings().themes[t.name] = fam.version; done.push(t); }
    save();
    if (done.length) refreshToast(`已安装「${fam.family}」`);
    else toastr.error('保存失败，请检查酒馆是否在运行', '主题伴侣');
    syncThemes();
}

async function updateFamily(fam, ask = true) {
    const { callGenericPopup, POPUP_TYPE } = ctx();
    const list = familyState(fam).stale;
    if (!list.length) return;
    if (ask) {
        const msg = `把「${fam.family}」更新到 ${fam.version}？<br><small>会覆盖你在「UI 主题」里对这个主题的颜色和「自订 CSS」做过的修改（在本扩展「主题设置」里的选择不受影响）。想保留的话，先在「UI 主题」里另存一份。</small>`;
        if (!await callGenericPopup(msg, POPUP_TYPE.CONFIRM)) return;
    }
    let ok = 0;
    for (const t of list) if (await saveTheme(t)) { settings().themes[t.name] = fam.version; ok++; }
    save();
    if (!ok) { toastr.error('保存失败，请检查酒馆是否在运行', '主题伴侣'); return; }
    if (ask) {
        toastr.success('页面马上刷新', `「${fam.family}」已更新`);
        setTimeout(() => location.reload(), 1800);   // 等设置保存完
    }
    syncThemes();
}

async function useTheme(name) {
    if (document.getElementById('themes')) {
        // 刚装上、还没刷新页面的主题不在下拉框里：先补一项，不然 val() 选不中，酒馆会把主题记成 "undefined"
        if (![...$('#themes option')].some(o => o.value === name)) $('#themes').append(new Option(name, name));
        $('#themes').val(name).trigger('change');
        return;
    }
    // #themes 被 TauriTavern 摘下来了：用它自己的换主题函数
    try {
        const pu = await import(new URL('../../../power-user.js', HERE).href);
        pu.applyGlobalTheme(name);
        setTimeout(onThemeChange, 300);
    } catch (e) {
        console.warn('[主题伴侣] 换主题失败', e);
        toastr.info(`请在「用户设置 → UI 主题」里选「${name}」`, '主题伴侣');
    }
}

// 换了主题：刷新面板、主题设置。TauriTavern 的「按聊天/角色绑定主题」换主题时不触发 #themes 的 change，所以也按名字比对
let lastTheme;
function onThemeChange() {
    lastTheme = currentTheme();
    syncUi(); syncThemes(); renderAllOptions(); applyOptions();
    clearLeftoverCss().catch(e => console.warn('[主题伴侣] 清理残留 CSS 失败', e));
}

// 酒馆换主题时，新主题文件里没有 custom_css 这一项（很多只调颜色的主题）就整项跳过，
// 上一套的「自订 CSS」会原样留在设置里，删主题、卸扩展都去不掉，每次启动都又套上。
// 换到别的主题后，自订 CSS 还是我们的（作者署名在 CSS 开头），而新主题本身没带 CSS：清空。
const OUR_CSS_MARK = 'mangosagocreamwithpomelo';
async function clearLeftoverCss() {
    const name = currentTheme();
    if (!name || !families.length || families.some(f => f.themes.some(t => t.name === name) || (f.retired || []).some(r => r.name === name))) return;
    const pu = ctx().powerUserSettings;
    if (!String(pu?.custom_css || '').includes(OUR_CSS_MARK)) return;
    let theme = (await serverThemes()).find(x => x.name === name);
    if (!theme) {   // 这次加载后才导入的主题：重新读一次
        savedThemes = null;
        theme = (await serverThemes()).find(x => x.name === name);
    }
    if (!theme || currentTheme() !== name) return;
    if (typeof theme.custom_css === 'string') {
        // 主题自己存着我们的 CSS（多半是用着我们的主题时「另存为」的）：不替用户改，提醒一次
        if (theme.custom_css.includes(OUR_CSS_MARK) && !(settings().cssHint ||= {})[name]) {
            settings().cssHint[name] = true; save();
            toastr.info(`「${name}」里存着主题伴侣附带主题的 CSS（可能是用着那套主题时另存的）。不想要的话，到「用户设置 → 自订 CSS」清空后再保存这个主题。`, '主题伴侣', { timeOut: 15000 });
        }
        return;
    }
    const box = $('#customCSS');
    if (box.length) box.val('').trigger('input');
    else { pu.custom_css = ''; document.getElementById('custom-style')?.replaceChildren(); save(); }
    toastr.info(`「${name}」没有自带 CSS，已清掉上一套主题留下的自订 CSS。`, '主题伴侣');
}
function checkThemeChange() {
    if (currentTheme() !== lastTheme) onThemeChange();
}

// 加载时：不再自动装新主题（主题越来越多，由用户在面板里挑）——新系列只提醒一次，点提醒打开主题列表；
// 已经装了的系列照常：缺的新成员补上，旧版按「自动更新主题」决定覆盖还是只提醒
// 施工中的系列：只有勾了「试用施工中的主题」才列出来
const hidden = (fam) => fam.draft && !settings().tryDrafts;

async function checkThemes() {
    await loadBundled();
    await loadServerNames();
    const s = settings();
    const have = installedNames();
    const added = [], updated = [];
    // 第一次用这个扩展（什么都没记过）：不装任何主题，提示去面板里挑；现有的系列都算提醒过了
    const firstRun = !s.welcomed && !Object.keys(s.themes).length;
    for (const fam of families) {
        if (hidden(fam)) continue;
        // 改过名的系列：装着旧名字那份（由本扩展装的）也算「已经装了」，新名字照常补上，旧的由 retireThemes 删掉
        const famHere = fam.themes.some(t => have.has(t.name))
            || (fam.retired || []).some(r => r.formerFamily && have.has(r.name) && isVersion(s.themes[r.name]));
        let staleHere = false;
        for (const t of fam.themes) {
            const rec = s.themes[t.name];
            if (!have.has(t.name)) {
                // 已经装了的系列补上新成员；勾了「自动安装新主题」的连没装过的新系列也装上。
                // 装过又被用户删掉的（有记录）不再装，面板里可以手动装
                const famNew = s.autoInstallNew && !fam.themes.some(x => s.themes[x.name]);
                if ((famHere || famNew) && !rec && await saveTheme(t)) { s.themes[t.name] = fam.version; added.push(fam.family); }
                continue;
            }
            // 用户自己导入的：内容和附带的一样就记成这个版本，不一样就是版本未知（算旧版）
            if (!rec) s.themes[t.name] = await sameAsBundled(t) ? fam.version : 'manual';
            if (!isStale(fam, s.themes[t.name])) continue;
            if (s.autoUpdateThemes) {
                if (await saveTheme(t)) { s.themes[t.name] = fam.version; updated.push(fam.family); }
            } else staleHere = true;
        }
        if (staleHere && s.notices?.[fam.family] !== fam.version) {   // 每个版本只提醒一次
            (s.notices ||= {})[fam.family] = fam.version;
            toastr.info(`在「扩展 → 主题伴侣」里可以一键更新到 ${fam.version}`, `「${fam.family}」有新版本`, { timeOut: 10000 });
        }
    }
    announceNew(firstRun);
    const { merged, renamed } = await retireThemes();
    await reapplyActive(updated);
    save();
    const uniq = a => [...new Set(a)].map(x => `「${x}」`).join('');
    if (renamed.length) refreshToast(renamed.join('，'));
    else if (merged.length && !added.length && !updated.length) {
        refreshToast(`${uniq(merged)}的几种${families.find(f => f.family === merged[0])?.variantLabel ?? '变体'}已合并成一套，在「主题设置」里切换`);
    } else if (added.length || updated.length) {
        refreshToast([added.length && `已安装${uniq(added)}`, updated.length && `已更新${uniq(updated)}`].filter(Boolean).join('，'));
    }
    syncThemes();
    renderAllOptions();
    applyOptions();
}

// 新系列：没装过、没记录过、没提醒过的，提醒一次（点一下打开主题列表）。第一次用扩展只给一条总的提示
function announceNew(firstRun) {
    const s = settings();
    const seen = (s.announced ||= {});
    const fresh = families.filter(f => !hidden(f) && !seen[f.family]
        && !f.themes.some(t => s.themes[t.name] || installedNames().has(t.name)));
    for (const f of families) if (!hidden(f) && (firstRun || fresh.includes(f))) seen[f.family] = true;
    for (const f of families) if (f.themes.some(t => s.themes[t.name])) seen[f.family] = true;
    if (!s.welcomed) {
        s.welcomed = true;
        if (firstRun) {
            stickyToast('点这里打开主题列表，挑想装的', '主题伴侣：主题需要自己装', openThemeList);
            return;
        }
    }
    if (!fresh.length) return;
    const names = fresh.map(f => `「${f.family}」`).join('');
    const text = fresh.length === 1 && fresh[0].blurb ? fresh[0].blurb : '点这里打开主题列表看看';
    toastr.info(text, `新主题${names}可以装了`, { timeOut: 12000, extendedTimeOut: 6000, onclick: openThemeList });
}

// 打开「扩展」面板并展开本扩展、滚到主题列表
function openThemeList() {
    const drawer = document.querySelector('#extensions-settings-button .drawer-toggle');
    const content = document.getElementById('rm_extensions_block');
    if (drawer && content && !content.classList.contains('openDrawer')) drawer.click();
    setTimeout(() => {
        const box = document.getElementById('daynight_settings');
        const inner = box?.querySelector('.inline-drawer-content');
        if (inner && getComputedStyle(inner).display === 'none') box.querySelector('.inline-drawer-toggle')?.click();
        setTimeout(() => document.getElementById('dn_themes_head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }, 400);
}

// 缩略图点开看大图（有 preview 用整张海报），下面是名字、介绍，再一行小字：各社区的发布帖
function showThumb(fam) {
    const { callGenericPopup, POPUP_TYPE } = ctx();
    const src = new URL(fam.preview || fam.thumb, HERE).href;
    const el = $(`<div class="dn-thumb-big"><img src="${src}" alt=""><div><b></b><small class="dn-thumb-blurb"></small></div></div>`);
    el.find('b').text(fam.family);
    el.find('.dn-thumb-blurb').text(fam.blurb || '');
    if (fam.links?.length) {
        const foot = $('<small class="dn-thumb-links"></small>');
        foot.append(document.createTextNode('欢迎留言~有任何建议反馈会尽快处理：'));
        fam.links.forEach(([label, url], i) => {
            if (!/^https:\/\//.test(url)) return;
            if (i) foot.append(document.createTextNode(' · '));
            foot.append($('<a target="_blank" rel="noopener"></a>').attr('href', url).text(label));
        });
        el.find('> div').append(foot);
    }
    callGenericPopup(el, POPUP_TYPE.TEXT, '', { wide: !!fam.preview, okButton: '关闭' });
}

// 酒馆启动时用的是设置里存的那份 CSS，不会重读主题文件：主题更新后正在用的那套要重新选一次才生效。
// 每个版本只做一次（之后你在「自订 CSS」里的改动不会被反复覆盖）；这次刚更新的等下次加载再做（酒馆内存里还是旧主题）
async function reapplyActive(updatedNow) {
    const name = currentTheme();
    const fam = families.find(f => f.themes.some(t => t.name === name));
    if (!fam || updatedNow.includes(fam.family)) return;
    const s = settings();
    const ver = s.themes[name];
    if (!isVersion(ver) || (s.applied ||= {})[name] === ver) return;
    const mine = (await serverThemes()).find(x => x.name === name);
    // 刚装上的（这次加载里才存进去，酒馆还不认识）：先不记，刷新页面后再比对、套一次
    if (!mine || savedNow.has(name)) return;
    if (mine.custom_css !== ctx().powerUserSettings?.custom_css) await useTheme(name);
    s.applied[name] = ver;
}

// 变体改成选项以后（themes.json 里的 retired）：以前由本扩展装上的那几份删掉；
// 正在用其中一份的，换回本体并把选项设成对应的值。用户自己导入的（版本记成 manual）不动
// 主题改名（retired 里带 formerFamily）：同样删掉旧名字那份，主题设置搬到新名字下
async function retireThemes() {
    const s = settings();
    const have = installedNames();
    const merged = [], renamed = [];
    for (const fam of families) {
        for (const { name, option, formerFamily } of fam.retired || []) {
            if (formerFamily && s.opts?.[formerFamily] && !s.opts[fam.family]) s.opts[fam.family] = s.opts[formerFamily];
            if (!have.has(name) || !isVersion(s.themes[name])) continue;
            if (currentTheme() === name) {
                if (option) famOpts(fam)[option.key] = option.value;
                useTheme(fam.themes[0].name);
            }
            try {
                const r = await fetch('/api/themes/delete', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ name }) });
                if (!r.ok) continue;
            } catch { continue; }
            delete s.themes[name];
            $('#themes option').filter((_, o) => o.value === name).remove();
            serverNames?.delete(name);
            if (formerFamily) renamed.push(`「${formerFamily}」改名为「${fam.family}」`);
            else merged.push(fam.family);
        }
    }
    return { merged, renamed };
}

const picked = new Set();   // 列表里勾了要装的系列名

function themeRow(fam, st) {
    const row = document.createElement('div');
    row.className = 'dn-theme';
    if (!st.installed.length) {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'dn-pick';
        box.title = '勾上，一起装';
        box.checked = picked.has(fam.family);
        box.onchange = () => { box.checked ? picked.add(fam.family) : picked.delete(fam.family); syncPickBar(); };
        row.append(box);
    }
    if (fam.thumb) {
        const img = document.createElement('img');
        img.className = 'dn-thumb';
        img.loading = 'lazy';
        img.alt = '';
        img.title = '看大图';
        img.src = new URL(fam.thumb, HERE).href;
        img.onclick = () => showThumb(fam);
        row.append(img);
    }
    const info = document.createElement('div');
    info.className = 'dn-theme-info';
    info.innerHTML = '<div><span class="dn-theme-name"></span><small class="dn-theme-state"></small></div><small class="dn-blurb"></small>';
    info.querySelector('.dn-theme-name').textContent = fam.family;
    const n = fam.themes.length > 1 ? `（含 ${fam.themes.length - 1} 种${fam.variantLabel}）` : '';
    info.querySelector('.dn-theme-state').textContent = !st.installed.length ? `${fam.version}${n}${fam.draft ? ' · 施工中' : ''}`
        : st.stale.length ? `可更新到 ${fam.version}`
        : `${fam.version}${st.using ? ' · 使用中' : ''}${st.missing.length ? ` · 缺 ${st.missing.length} 个${fam.variantLabel}` : ''}`;
    info.querySelector('.dn-blurb').textContent = fam.blurb || '';
    row.append(info);
    const act = document.createElement('span');
    act.className = 'dn-theme-act';
    const btn = (label, fn) => {
        const b = document.createElement('div');
        b.className = 'menu_button';
        b.textContent = label;
        b.onclick = fn;
        act.append(b);
    };
    if (st.missing.length) btn(st.installed.length ? '补装' : '安装', () => installFamily(fam));
    if (st.stale.length) btn('更新', () => updateFamily(fam));
    if (st.installed.length && !st.using) btn('使用', () => useTheme(st.installed[0].name));
    row.append(act);
    return row;
}

function syncThemes() {
    const box = document.getElementById('dn_themes');
    if (!box) return;
    box.innerHTML = '';
    let staleCount = 0;
    const mine = [], other = [];
    for (const fam of families) {
        if (hidden(fam)) continue;   // 施工中的不列出来
        const st = familyState(fam);
        if (st.stale.length) staleCount++;
        (st.installed.length ? mine : other).push(themeRow(fam, st));
    }
    const sub = (text) => { const d = document.createElement('div'); d.className = 'dn-subhead'; d.textContent = text; box.append(d); };
    if (mine.length) { sub('已安装'); box.append(...mine); }
    if (other.length) {
        sub(mine.length ? '还没装的' : '挑想装的主题');
        box.append(...other);
        const bar = document.createElement('div');
        bar.className = 'dn-pick-bar';
        bar.innerHTML = '<div class="menu_button dn-pick-all"></div><div class="menu_button dn-pick-go"></div>';
        box.append(bar);
        const names = families.filter(f => !hidden(f) && !familyState(f).installed.length).map(f => f.family);
        for (const n of [...picked]) if (!names.includes(n)) picked.delete(n);
        bar.querySelector('.dn-pick-all').onclick = () => {
            const all = names.every(n => picked.has(n));
            for (const n of names) all ? picked.delete(n) : picked.add(n);
            syncThemes();
        };
        bar.querySelector('.dn-pick-go').onclick = () => {
            const fams = families.filter(f => picked.has(f.family));
            if (!fams.length) return;
            picked.clear();
            installMany(fams);
        };
        syncPickBar(names);
    }
    if (!families.length) box.textContent = '（没有找到附带的主题）';
    $('#dn_update_all').toggle(staleCount > 1);
    $('#dn_drafts_row').toggle(families.some(f => f.draft));
}

function syncPickBar(names) {
    const bar = document.querySelector('#dn_themes .dn-pick-bar');
    if (!bar) return;
    names ||= families.filter(f => !hidden(f) && !familyState(f).installed.length).map(f => f.family);
    bar.querySelector('.dn-pick-all').textContent = names.length && names.every(n => picked.has(n)) ? '全不选' : '全选';
    const go = bar.querySelector('.dn-pick-go');
    go.textContent = picked.size ? `安装勾选的 ${picked.size} 套` : '安装勾选的';
    go.classList.toggle('disabled', !picked.size);
}

async function updateAll() {
    const list = families.filter(f => !hidden(f) && familyState(f).stale.length);
    const { callGenericPopup, POPUP_TYPE } = ctx();
    const msg = `更新 ${list.map(f => `「${f.family}」`).join('')}？<br><small>会覆盖你在「UI 主题」里对这些主题做过的修改。</small>`;
    if (!await callGenericPopup(msg, POPUP_TYPE.CONFIRM)) return;
    for (const f of list) await updateFamily(f, false);
    toastr.success('页面马上刷新', '已全部更新');
    setTimeout(() => location.reload(), 1800);
}

// ================================================================
// 主题设置：系列在 themes.json 里声明 options，这里画界面、把选择写成 CSS
//   { type: 'head', label }                         小标题
//   { type: 'select', var, label, default, choices: [[值, 名称]…] }   choices 也可以是 { value, label, css }
//     choice 的 css 里写 {EXT} 会换成扩展地址，如 url("{EXT}assets/daoshi/hammer.jpg")
//     加 onBackgroundPick: 值 —— 用户在酒馆背景面板里挑图时自动切到这个值
//   { type: 'toggle', var, label, default: true, on: '1', off: '0' }
//   { type: 'text', var, label, default }           写成 CSS 字符串
//   { type: 'number', var, label, default, min, max, step, unit }
//   { type: 'color', var, label, default }
//   { type: 'dateformat', key, label, default }     消息时间的显示格式（改的是文字，不是 CSS）
// 没动过的选项不写，主题「可改区」里原来的值照常生效。
// ================================================================
const optKey = o => o.key ?? o.var;
const choicesOf = o => (o.choices || []).map(c => Array.isArray(c) ? { value: c[0], label: c[1] } : c);
const famOpts = fam => (settings().opts[fam.family] ||= {});

function cssString(v) {
    return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]+/g, ' ').replace(/</g, '\\3C ') + '"';
}

function optionValue(o, saved) {
    const v = saved[optKey(o)];
    if (v !== undefined) return v;
    if (o.type === 'toggle') return o.default ?? true;
    if (o.type === 'select') return o.default ?? choicesOf(o)[0]?.value;
    return o.default;
}

// 今天的日期。reiwa：令和八年 十月二十日（汉字数字）；其它：2026年10月20日
const KANJI = '〇一二三四五六七八九';
function kanjiNum(n) {
    if (n < 10) return KANJI[n];
    const t = Math.floor(n / 10), o = n % 10;
    return (t > 1 ? KANJI[t] : '') + '十' + (o ? KANJI[o] : '');
}

function todayText(format) {
    const d = new Date();
    if (format === 'reiwa') return `令和${kanjiNum(d.getFullYear() - 2018)}年 ${kanjiNum(d.getMonth() + 1)}月${kanjiNum(d.getDate())}日`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function chatName() {
    try {
        const c = ctx();
        if (c.groupId) return c.groups?.find(g => String(g.id) === String(c.groupId))?.name || '';
        if (c.characterId !== undefined && c.characterId !== null) return c.characters?.[c.characterId]?.name || '';
    } catch { /* 忽略 */ }
    return '';
}

// 聊天专属背景（#bg_custom）优先，其次是全局背景（#bg1）
function bgImage() {
    for (const id of ['bg_custom', 'bg1']) {
        const el = document.getElementById(id);
        const img = el && getComputedStyle(el).backgroundImage;
        if (img && img !== 'none' && img.startsWith('url(')) return img;
    }
    return '';
}

// 背景图换了就重写一次（酒馆是改 #bg1 / #bg_custom 的行内样式）
let bgWatch = null;
function watchBackground() {
    if (bgWatch) return;
    let t = 0;
    bgWatch = new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => { if (currentFamily()?.bgVar) applyOptions(); }, 200);
    });
    for (const id of ['bg_custom', 'bg1']) {
        const el = document.getElementById(id);
        if (el) bgWatch.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    }
}

function optionCss(fam) {
    const saved = famOpts(fam);
    const decl = [], extra = [];
    for (const o of fam.options || []) {
        const k = optKey(o);
        if (!k || saved[k] === undefined) continue;
        const v = saved[k];
        if (o.type === 'select') {
            const c = choicesOf(o).find(c => c.value === v);
            // {EXT} = 扩展自己的地址（以 / 结尾），选项里可以引用扩展附带的图片
            if (c?.css) extra.push(c.css.replaceAll('{EXT}', HERE.href));
            else if (c && o.var && v !== optionValue(o, {})) decl.push(`${o.var}: ${v};`);
        } else if (o.type === 'toggle') {
            if (!o.var || v === (o.default ?? true)) continue;
            const val = v ? (o.on ?? '1') : (o.off ?? '0');
            if (val !== '') decl.push(`${o.var}: ${val};`);
        } else if (o.type === 'text') {
            decl.push(`${o.var}: ${cssString(v)};`);
        } else if (o.type === 'number') {
            const n = Number(v);
            if (Number.isFinite(n)) decl.push(`${o.var}: ${n}${o.unit || ''};`);
        } else if (o.type === 'color') {
            if (/^#[0-9a-f]{3,8}$/i.test(v)) decl.push(`${o.var}: ${v};`);
        }
    }
    // today：把今天的日期写进主题指定的变量
    if (fam.today?.var) decl.push(`${fam.today.var}: ${cssString(todayText(fam.today.format))};`);
    // chatName：把当前聊天的名字（角色名 / 群聊名）写进主题指定的变量（如苔庭潭北亭的扁额）
    if (fam.chatName) {
        const name = chatName();
        if (name) decl.push(`${fam.chatName}: ${cssString(name)};`);
    }
    // bgVar：把当前的聊天背景图写进主题指定的变量（如苔庭启动页丸窓里的景）
    if (fam.bgVar) {
        const img = bgImage();
        if (img) decl.push(`${fam.bgVar}: ${img};`);
    }
    // html:root:root 比主题可改区的 html:root 多一级，手机端的 @media 里也压得住
    return (decl.length ? `html:root:root {\n    ${decl.join('\n    ')}\n}\n` : '') + extra.join('\n');
}

function setOptionCss(css) {
    let el = document.getElementById('companion_theme_options');
    if (!el) {
        el = document.createElement('style');
        el.id = 'companion_theme_options';
    }
    // 放在 <body> 末尾，排在酒馆的自订 CSS 后面
    (document.body || document.head).append(el);
    if (el.textContent !== css) el.textContent = css;
}

function applyOptions() {
    const fam = currentFamily();
    const css = fam ? optionCss(fam) : '';
    setOptionCss(css);
    remember({ css });
    formatDates();
    syncModule(fam);
}

// 系列自带的脚本（themes.json 里的 module，如 WPS 的可拖标尺）：用这套主题时载入，换走时清理
let moduleOn = null;   // { family, cleanup }
async function syncModule(fam) {
    const want = fam?.module ? fam.family : null;
    if (moduleOn?.family === want) return;
    if (moduleOn) {
        const { cleanup } = moduleOn;
        moduleOn = null;
        try { cleanup?.(); } catch (e) { console.warn('[主题伴侣] 主题脚本清理失败', e); }
    }
    if (!want) return;
    const slot = moduleOn = { family: want, cleanup: null };
    try {
        const mod = await import(new URL(`${fam.module}?v=${encodeURIComponent(fam.version || '')}`, HERE).href);
        if (moduleOn !== slot) return;   // 载入期间又换了主题
        const opt = key => (fam.options || []).find(o => optKey(o) === key);
        slot.cleanup = mod.default({
            // 读一个选项（没存过就是默认值）
            get: key => { const o = opt(key); return o ? optionValue(o, famOpts(fam)) : undefined; },
            // 选项本身（标签、可选值……），主题脚本可以照着做自己的下拉列表
            option: key => opt(key),
            // 存一个选项并套用（undefined = 恢复默认）
            set: (key, v) => { const o = opt(key); if (!o) return; setOption(fam, o, v); renderAllOptions(); },
            // 切昼夜：'day' / 'night' / 'toggle'（和 /daynight 一样，切了就是手动模式）
            dayNight: cmd => setMode(cmd || 'toggle'),
        }) || null;
    } catch (e) {
        console.warn('[主题伴侣] 主题脚本载入失败', e);
    }
}

function setOption(fam, o, v) {
    const saved = famOpts(fam);
    if (v === undefined) delete saved[optKey(o)];
    else saved[optKey(o)] = v;
    save();
    applyOptions();
}

// 在酒馆「背景」面板里挑了图：带 onBackgroundPick 的选项自动切过去（如导视的混凝土墙 → 酒馆背景图）
function followBackgroundPick() {
    const fam = currentFamily();
    if (!fam) return;
    for (const o of fam.options || []) {
        if (o.onBackgroundPick === undefined) continue;
        if (optionValue(o, famOpts(fam)) === o.onBackgroundPick) continue;
        setOption(fam, o, o.onBackgroundPick);
        renderAllOptions();
        toastr.info(`已把「${o.label}」切换为背景图。想换回来，在主题设置里改。`, '主题伴侣');
    }
}

// ---------- 时间格式 ----------
const DATE_FORMATS = [
    ['st', '酒馆默认', null],
    ['film', '胶片日期印', '[’]YY MM DD  HH:mm'],
    ['short', '月-日 时:分', 'MM-DD HH:mm'],
    ['time', '只显示时间', 'HH:mm'],
];

function datePattern() {
    const fam = currentFamily();
    const o = fam?.options?.find(x => x.type === 'dateformat');
    if (!o) return null;
    const v = optionValue(o, famOpts(fam));
    return DATE_FORMATS.find(f => f[0] === v)?.[2] ?? null;
}

function messageMoment(mes, text) {
    const { chat, timestampToMoment } = ctx();
    const m = chat?.[Number(mes?.getAttribute('mesid'))];
    const sd = m?.swipe_info?.[m.swipe_id]?.send_date ?? m?.send_date;
    let t = sd && timestampToMoment ? timestampToMoment(sd) : null;
    if (!t?.isValid?.() && window.moment) t = window.moment(text, 'LL LT');
    return t?.isValid?.() ? t : null;
}

// 酒馆写进 .timestamp 的是「2026年10月17日 21:04」；这里按主题设置换个写法，原文记在 data-cp-src
function formatDates(scope = document.querySelectorAll('#chat .mes .timestamp')) {
    const pattern = datePattern();
    for (const el of scope) {
        const cur = el.textContent;
        if (!cur && !el.dataset.cpSrc) continue;
        // 这套主题不改日期写法、这条也没改过：什么都不用做（不然每帧都要给每条消息写一遍属性）
        if (!pattern && el.dataset.cpSrc === undefined) continue;
        if (el.dataset.cpOut !== cur) el.dataset.cpSrc = cur;   // 酒馆刚写过（新消息、切换回复）
        const src = el.dataset.cpSrc;
        let out = src;
        if (pattern && src) {
            const t = messageMoment(el.closest('.mes'), src);
            if (t) out = t.format(pattern);
        }
        if (el.dataset.cpOut !== out) el.dataset.cpOut = out;
        if (out !== cur) el.textContent = out;
    }
}

// 聊天里有变动时只看动到的那几条消息（流式输出时每帧只动最后一条；以前是每帧把整个聊天的日期都过一遍）
let dateQueued = false;
const dateDirty = new Set();
function watchDates() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    new MutationObserver((records) => {
        for (const r of records) {
            const n = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            const mes = n?.closest?.('.mes');
            if (mes) dateDirty.add(mes);
            else for (const a of r.addedNodes) if (a.nodeType === 1) dateDirty.add(a);
        }
        if (dateQueued) return;
        dateQueued = true;
        requestAnimationFrame(() => {
            dateQueued = false;
            const list = [];
            for (const m of dateDirty) {
                if (!m.isConnected) continue;
                if (m.matches('.timestamp')) list.push(m);
                else list.push(...m.querySelectorAll('.timestamp'));
            }
            dateDirty.clear();
            if (list.length) formatDates(list);
        });
    }).observe(chat, { childList: true, subtree: true, characterData: true });
}

// ================================================================
// 声音：回复写完（酒馆的 GENERATION_ENDED，停止生成也算）时播一下
// 选项存在 opts[系列] 的 _sound（开关）、_volume（0–100）；自己的文件存在 IndexedDB
// ================================================================
const SOUND_DB = 'companion-sounds';
let soundUrls = {};   // 系列名 → 自己文件的 blob URL

function soundDb() {
    return new Promise((ok, fail) => {
        const r = indexedDB.open(SOUND_DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
    });
}

async function soundFile(fam, blob) {   // blob 省略 = 读；null = 删
    const db = await soundDb();
    return new Promise((ok, fail) => {
        const tx = db.transaction('files', blob === undefined ? 'readonly' : 'readwrite');
        const st = tx.objectStore('files');
        const r = blob === undefined ? st.get(fam.family) : blob === null ? st.delete(fam.family) : st.put(blob, fam.family);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
    });
}

async function customSoundUrl(fam) {
    if (fam.family in soundUrls) return soundUrls[fam.family];
    let url = null;
    try {
        const blob = await soundFile(fam);
        if (blob) url = URL.createObjectURL(blob);
    } catch { /* 无痕模式等用不了 IndexedDB */ }
    return (soundUrls[fam.family] = url);
}

function soundOn(fam) {
    return famOpts(fam)._sound ?? fam.sound.default ?? true;
}

function soundVolume(fam) {
    return famOpts(fam)._volume ?? fam.sound.volume ?? 70;
}

async function playSound(fam = currentFamily(), force = false) {
    if (!fam?.sound || (!force && !soundOn(fam))) return;
    const src = await customSoundUrl(fam) || new URL(fam.sound.file, HERE).href;
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, soundVolume(fam) / 100));
    a.play().catch(() => { /* 浏览器要求先和页面交互过才能出声 */ });
}

function renderSound(box, fam) {
    const snd = fam.sound;
    const h = document.createElement('div');
    h.className = 'dn-subhead';
    h.textContent = '声音';
    box.append(h);

    const on = field(`写完时出声（${snd.label}）`, snd.note);
    on.classList.add('dn-check');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = soundOn(fam);
    cb.onchange = () => { famOpts(fam)._sound = cb.checked; save(); };
    on.append(cb);
    box.append(on);

    const vol = field('音量');
    const range = document.createElement('input');
    range.type = 'range';
    Object.assign(range, { min: 0, max: 100, step: 5, value: soundVolume(fam) });
    range.onchange = () => { famOpts(fam)._volume = Number(range.value); save(); playSound(fam, true); };
    vol.append(range);
    box.append(vol);

    const row = document.createElement('div');
    row.className = 'dn-row dn-sound';
    const test = document.createElement('div');
    test.className = 'menu_button';
    test.textContent = '试听';
    test.onclick = () => playSound(fam, true);
    const pick = document.createElement('div');
    pick.className = 'menu_button';
    pick.textContent = '换成自己的音效…';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.hidden = true;
    const state = document.createElement('small');
    const reset = document.createElement('div');
    reset.className = 'menu_button';
    reset.textContent = '用回默认';
    const show = async () => {
        const mine = !!await customSoundUrl(fam);
        state.textContent = mine ? '正在用你自己的文件' : `默认：${snd.credit}`;
        reset.style.display = mine ? '' : 'none';
    };
    pick.onclick = () => input.click();
    input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toastr.warning('文件太大了，挑一个 5MB 以内的短音效。'); return; }
        try {
            await soundFile(fam, f);
            if (soundUrls[fam.family]) URL.revokeObjectURL(soundUrls[fam.family]);
            delete soundUrls[fam.family];
            await show();
            playSound(fam, true);
        } catch {
            toastr.error('这个浏览器存不了文件（可能是无痕模式）。');
        }
    };
    reset.onclick = async () => {
        try { await soundFile(fam, null); } catch { /* 忽略 */ }
        if (soundUrls[fam.family]) URL.revokeObjectURL(soundUrls[fam.family]);
        soundUrls[fam.family] = null;
        await show();
    };
    row.append(test, pick, reset, input);
    box.append(row);
    state.className = 'dn-note';
    box.append(state);
    show();
}

// ---------- 设置界面 ----------
function field(label, note) {
    const row = document.createElement('label');
    row.className = 'dn-row dn-opt';
    const l = document.createElement('span');
    l.className = 'dn-label';
    l.textContent = label;
    row.append(l);
    if (note) row.title = note;
    return row;
}

function renderOptions(box) {
    if (!box) return;
    box.innerHTML = '';
    const fam = currentFamily();
    if (!fam) {
        box.innerHTML = '<small class="dn-note">当前主题不是本扩展附带的，没有可调的选项。</small>';
        return;
    }
    const saved = famOpts(fam);
    const have = installedNames();

    // 变体（如调色）：切换主题
    if (fam.themes.length > 1) {
        const row = field(fam.variantLabel);
        const sel = document.createElement('select');
        sel.className = 'text_pole';
        for (const t of fam.themes) {
            const opt = new Option(t.label + (have.has(t.name) ? '' : '（未安装）'), t.name);
            opt.disabled = !have.has(t.name);
            sel.append(opt);
        }
        sel.value = currentTheme();
        sel.onchange = () => useTheme(sel.value);
        row.append(sel);
        box.append(row);
    }

    for (const o of fam.options || []) {
        if (o.type === 'head') {
            const h = document.createElement('div');
            h.className = 'dn-subhead';
            h.textContent = o.label;
            box.append(h);
            continue;
        }
        const row = field(o.label, o.note);
        const v = optionValue(o, saved);
        let input;
        if (o.type === 'select' || o.type === 'dateformat') {
            input = document.createElement('select');
            input.className = 'text_pole';
            const list = o.type === 'dateformat'
                ? DATE_FORMATS.map(([value, label, p]) => ({ value, label: window.moment ? `${label}（${window.moment().format(p || 'LL LT')}）` : label }))
                : choicesOf(o);
            for (const c of list) input.append(new Option(c.label, c.value));
            input.value = v;
            input.onchange = () => setOption(fam, o, input.value);
        } else if (o.type === 'toggle') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!v;
            input.onchange = () => setOption(fam, o, input.checked);
            row.classList.add('dn-check');
        } else if (o.type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.className = 'text_pole';
            Object.assign(input, { min: o.min ?? '', max: o.max ?? '', step: o.step ?? 'any', value: v });
            input.onchange = () => setOption(fam, o, input.value === '' ? undefined : Number(input.value));
        } else if (o.type === 'color') {
            input = document.createElement('input');
            input.type = 'color';
            input.value = v;
            input.oninput = () => setOption(fam, o, input.value);
        } else if (o.type === 'text') {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'text_pole';
            input.placeholder = '（留空 = 不显示）';
            input.value = v ?? '';
            let timer;
            input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => setOption(fam, o, input.value), 250); };
        } else continue;
        row.append(input);
        if (o.note && o.type === 'toggle') {
            const n = document.createElement('small');
            n.textContent = o.note;
            row.append(n);
        }
        box.append(row);
    }

    if (fam.sound) renderSound(box, fam);

    const reset = document.createElement('div');
    reset.className = 'menu_button dn-reset';
    reset.textContent = '恢复这套主题的默认设置';
    reset.onclick = async () => {
        const { callGenericPopup, POPUP_TYPE } = ctx();
        if (!await callGenericPopup(`把「${fam.family}」的主题设置全部恢复默认？`, POPUP_TYPE.CONFIRM)) return;
        settings().opts[fam.family] = {};
        save();
        if (fam.sound) { try { await soundFile(fam, null); } catch { /* 忽略 */ } soundUrls[fam.family] = null; }
        applyOptions();
        renderAllOptions();
        if (box.id !== 'dn_options') renderOptions(box);
    };
    box.append(reset);
}

function renderAllOptions() {
    renderOptions(document.getElementById('dn_options'));
    const title = document.getElementById('dn_options_title');
    if (title) title.textContent = currentFamily() ? `主题设置 · ${currentFamily().family}` : '主题设置';
}

async function openOptionsPopup() {
    const { callGenericPopup, POPUP_TYPE } = ctx();
    const box = document.createElement('div');
    box.className = 'daynight-settings dn-popup';
    const h = document.createElement('h3');
    h.textContent = currentFamily() ? `主题设置 · ${currentFamily().family}` : '主题设置';
    const inner = document.createElement('div');
    box.append(h, inner);
    renderOptions(inner);
    await callGenericPopup(box, POPUP_TYPE.TEXT, '', { allowVerticalScrolling: true, okButton: '完成' });
    renderAllOptions();
}

// ================================================================
// 扩展自己的更新（走酒馆「管理扩展」同样的接口，需要是用 Git 地址装的）
// ================================================================
const EXT_DIR = decodeURIComponent(HERE.pathname.split('/').filter(Boolean).pop());
const ext = { version: '', global: false, state: 'unknown' };
const EXT_STATE = {
    unknown: '', checking: '检查中…', latest: '已是最新', behind: '有新版本',
    updated: '已更新，刷新页面后生效', nogit: '不是用 Git 地址安装的，无法在线更新', error: '检查失败',
};

async function loadExtInfo() {
    try {
        const m = await (await fetch(new URL('manifest.json', HERE), { cache: 'no-cache' })).json();
        ext.version = m.version || '';
    } catch { /* 忽略 */ }
    try {
        const list = await (await fetch('/api/extensions/discover')).json();
        ext.global = list.find(x => x.name === `third-party/${EXT_DIR}`)?.type === 'global';
    } catch { /* 忽略 */ }
    syncExt();
}

async function extApi(endpoint) {
    const r = await fetch(`/api/extensions/${endpoint}`, {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ extensionName: EXT_DIR, global: ext.global }),
    });
    if (r.status === 403) throw Object.assign(new Error('forbidden'), { forbidden: true });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

async function checkExt(manual = false) {
    ext.state = 'checking';
    syncExt();
    try {
        const d = await extApi('version');
        ext.state = !d.currentCommitHash ? 'nogit' : d.isUpToDate ? 'latest' : 'behind';
    } catch (e) {
        ext.state = 'error';
        console.warn('[主题伴侣] 检查扩展更新失败', e);
    }
    syncExt();
    if (ext.state !== 'behind') return;
    if (settings().autoUpdateExt) await updateExt();
    else if (!manual) toastr.info('在「扩展 → 主题伴侣」里可以一键更新', '主题伴侣有新版本', { timeOut: 10000 });
}

async function updateExt() {
    ext.state = 'checking';
    syncExt();
    try {
        const d = await extApi('update');
        ext.state = d.isUpToDate ? 'latest' : 'updated';
        if (!d.isUpToDate) stickyToast('点这里刷新页面，新版本就会生效', '主题伴侣已更新', () => location.reload());
    } catch (e) {
        ext.state = 'error';
        toastr.error(e.forbidden ? '这个扩展是「给所有用户」安装的，只有管理员账号能更新' : '更新失败，详情见浏览器控制台', '主题伴侣');
        console.warn('[主题伴侣] 更新扩展失败', e);
    }
    syncExt();
}

function syncExt() {
    $('#dn_ext_version').text(ext.version ? `版本 ${ext.version}` : '');
    $('#dn_ext_state').text(EXT_STATE[ext.state] || '');
    $('#dn_ext_update').toggle(ext.state === 'behind');
    $('#dn_ext_auto').prop('checked', settings().autoUpdateExt);
    $('#dn_theme_auto').prop('checked', settings().autoUpdateThemes);
    $('#dn_theme_new').prop('checked', settings().autoInstallNew);
    $('#dn_drafts').prop('checked', settings().tryDrafts);
}

// 每天最多自动检查一次（要连 GitHub，慢）
function dailyExtCheck() {
    const today = new Date().toDateString();
    try {
        if (localStorage.getItem('companion:extCheck') === today) return;
        localStorage.setItem('companion:extCheck', today);
    } catch { /* 忽略 */ }
    checkExt().catch(() => {});
}

// ================================================================
// 界面
// ================================================================
const PANEL = `
<div id="daynight_settings" class="daynight-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>主题伴侣</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="dn-head" id="dn_options_title">主题设置</div>
            <div id="dn_options"></div>

            <div class="dn-head">昼夜开关</div>
            <div class="dn-unsupported">当前主题不支持昼夜切换。换成「纸上访谈」「银盐显影」等支持的主题后，这里的设置才会生效。</div>
            <div class="dn-row">
                <span class="dn-label">切换方式</span>
                <select id="dn_mode" class="text_pole">
                    <option value="system">跟随系统</option>
                    <option value="manual">手动</option>
                    <option value="auto">按时间自动</option>
                </select>
            </div>
            <div class="dn-row" id="dn_manual_row">
                <span class="dn-label">现在是</span>
                <div class="dn-seg">
                    <div class="menu_button" data-dn="night"><i class="fa-solid fa-moon"></i>夜</div>
                    <div class="menu_button" data-dn="day"><i class="fa-solid fa-sun"></i>昼</div>
                </div>
            </div>
            <div class="dn-row" id="dn_auto_row">
                <span class="dn-label">白天</span>
                <input id="dn_start" type="time" class="text_pole">
                <span>到</span>
                <input id="dn_end" type="time" class="text_pole">
            </div>
            <div class="dn-row" id="dn_paper_row">
                <span class="dn-label">昼版纸张</span>
                <select id="dn_paper" class="text_pole"></select>
            </div>
            <small class="dn-note">夜版颜色在「UI 主题」的颜色选择器里改；更细的地方在「自订 CSS」最上方的「可改区」里改。</small>

            <div class="dn-head" id="dn_themes_head">主题</div>
            <div id="dn_themes"></div>
            <div id="dn_update_all" class="menu_button dn-wide">全部更新</div>
            <label class="dn-row dn-check"><input id="dn_theme_new" type="checkbox"><span>自动安装新主题</span><small>勾上时把还没装过的主题都装上，以后扩展带来新主题也直接装（不勾就只提醒一次）。自己删掉的不会再装回来</small></label>
            <label class="dn-row dn-check"><input id="dn_theme_auto" type="checkbox"><span>自动更新主题</span><small>会覆盖你在「UI 主题」里对这些主题做的修改；关掉时只提醒</small></label>
            <label id="dn_drafts_row" class="dn-row dn-check"><input id="dn_drafts" type="checkbox"><span>试用施工中的主题</span><small>还没正式发布的主题，勾上后列在上面，可能随时大改</small></label>

            <div class="dn-head">扩展</div>
            <div class="dn-row dn-ext">
                <span id="dn_ext_version"></span>
                <small id="dn_ext_state"></small>
                <span class="dn-theme-act">
                    <div id="dn_ext_update" class="menu_button">更新</div>
                    <div id="dn_ext_check" class="menu_button">检查更新</div>
                </span>
            </div>
            <label class="dn-row dn-check"><input id="dn_ext_auto" type="checkbox"><span>自动更新扩展</span><small>每天检查一次，有新版本就装上</small></label>
        </div>
    </div>
</div>`;

const MENU = `
<div id="dn_menu_toggle" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="切换昼 / 夜">
    <div class="fa-solid fa-circle-half-stroke extensionsMenuExtensionButton"></div>
    <span>切换昼 / 夜</span>
</div>
<div id="dn_menu_options" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="主题设置">
    <div class="fa-solid fa-sliders extensionsMenuExtensionButton"></div>
    <span>主题设置</span>
</div>`;

function papers() {
    return themeVar('--dn-papers').split('|').map(x => x.split(':')).filter(x => x.length === 2);
}

function syncUi() {
    const panel = document.getElementById('daynight_settings');
    if (!panel) return;
    const s = settings();
    const supported = themeVar('--dn-support') === '1';
    panel.classList.toggle('is-unsupported', !supported);
    $('#dn_mode').val(s.mode);
    $('#dn_manual_row').toggle(s.mode === 'manual');
    $('#dn_auto_row').toggle(s.mode === 'auto');
    $('#dn_start').val(s.dayStart);
    $('#dn_end').val(s.dayEnd);
    const isDay = root.classList.contains('dn-day');
    $('#daynight_settings [data-dn]').each(function () {
        this.classList.toggle('dn-on', (this.dataset.dn === 'day') === isDay);
    });
    const list = papers();
    const sel = $('#dn_paper');
    sel.empty();
    for (const [v, label] of list) sel.append(new Option(label, v));
    sel.val(list.some(([v]) => v === s.paper) ? s.paper : 'default');
    $('#dn_paper_row').toggle(list.length > 0);
}

function mountUi() {
    $('#extensions_settings2').append(PANEL);
    $('#extensionsMenu').append(MENU);

    $('#dn_mode').on('change', function () { settings().mode = this.value; save(); apply(); });
    $('#daynight_settings').on('click', '[data-dn]', function () { setMode(this.dataset.dn); });
    $('#dn_start').on('change', function () { settings().dayStart = this.value; save(); apply(); });
    $('#dn_end').on('change', function () { settings().dayEnd = this.value; save(); apply(); });
    $('#dn_paper').on('change', function () { settings().paper = this.value; save(); apply(false); });
    $('#dn_theme_auto').on('change', function () { settings().autoUpdateThemes = this.checked; save(); });
    $('#dn_theme_new').on('change', async function () {
        settings().autoInstallNew = this.checked;
        save();
        if (this.checked) await checkThemes().catch(e => console.warn('[主题伴侣] 检查主题失败', e));
    });
    $('#dn_drafts').on('change', async function () {
        settings().tryDrafts = this.checked;
        save();
        if (this.checked) await checkThemes().catch(e => console.warn('[主题伴侣] 检查主题失败', e));
        syncThemes();
    });
    $('#dn_ext_auto').on('change', function () { settings().autoUpdateExt = this.checked; save(); if (this.checked) checkExt(true); });
    $('#dn_ext_check').on('click', () => checkExt(true));
    $('#dn_ext_update').on('click', () => updateExt());
    $('#dn_update_all').on('click', () => updateAll());
    $('#dn_menu_toggle').on('click', () => {
        const was = settings().mode;
        setMode('toggle');
        if (was !== 'manual') toastr.info(`已从「${was === 'auto' ? '按时间自动' : '跟随系统'}」改为手动，可在扩展设置里改回。`, '昼夜开关');
    });
    $('#dn_menu_options').on('click', () => openOptionsPopup());
    syncExt();
}

function registerCommand() {
    try {
        const { SlashCommandParser, SlashCommand, SlashCommandArgument } = ctx();
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'daynight',
            callback: (_, value) => { setMode(['day', 'night', 'auto', 'system'].includes(value) ? value : 'toggle'); return ''; },
            unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'day / night / auto / system / toggle（留空 = toggle）', enumList: ['day', 'night', 'auto', 'system', 'toggle'] })],
            helpString: '切换昼夜：day 昼、night 夜、auto 按时间自动、system 跟随系统、toggle（默认）来回切换',
        }));
    } catch (e) {
        console.warn('[主题伴侣] 斜杠命令注册失败', e);
    }
}

jQuery(() => {
    mountUi();
    registerCommand();
    apply(false);
    watchDates();
    loadExtInfo();
    // 换主题时刷新面板（新主题可能不支持昼夜、选项不同）
    const { eventSource, eventTypes } = ctx();
    if (eventTypes?.SETTINGS_UPDATED) eventSource.on(eventTypes.SETTINGS_UPDATED, () => { syncUi(); checkThemeChange(); });
    if (eventTypes?.CHAT_CHANGED) eventSource.on(eventTypes.CHAT_CHANGED, () => setTimeout(() => {
        checkThemeChange();
        formatDates();
        if (currentFamily()?.chatName) applyOptions();
    }, 0));
    if (eventTypes?.GENERATION_ENDED) eventSource.on(eventTypes.GENERATION_ENDED, () => playSound());
    $(document).on('change', '#themes', () => setTimeout(onThemeChange, 300));
    // TauriTavern 在扩展抽屉关着时会把本面板摘下来，期间的刷新都落空了：抽屉打开时重画一遍
    const extBlock = document.getElementById('rm_extensions_block');
    if (extBlock) new MutationObserver(() => {
        if (extBlock.classList.contains('openDrawer')) setTimeout(() => { syncUi(); syncThemes(); renderAllOptions(); }, 0);
    }).observe(extBlock, { attributes: true, attributeFilter: ['class'] });
    // 用原生监听：酒馆初始化背景面板时会 $(document).off('click', '.bg_example')，jQuery 的委托会被一起清掉
    document.addEventListener('click', e => {
        if (!e.target.closest?.('.bg_example')) return;
        if (e.target.closest('.jg-button, .mobile-only-menu-toggle, .bg_example_cross, .bg_example_lock, .bg_example_unlock, .bg_example_edit, .bg_example_copy')) return;
        followBackgroundPick();
    });
    if (eventTypes?.FORCE_SET_BACKGROUND) eventSource.on(eventTypes.FORCE_SET_BACKGROUND, followBackgroundPick);
    // 等酒馆把主题列表填好再检查附带的主题（APP_READY 已经发生过的话会立刻触发）
    eventSource.on(eventTypes.APP_READY, () => {
        watchBackground();
        lastTheme = currentTheme();
        if (currentFamily()?.bgVar) applyOptions();
        checkThemes().catch(e => console.warn('[主题伴侣] 检查主题失败', e))
            .then(() => clearLeftoverCss()).catch(e => console.warn('[主题伴侣] 清理残留 CSS 失败', e));
        dailyExtCheck();
    });
    // 按时间自动：每分钟看一次
    setInterval(() => { if (settings().mode === 'auto') apply(); }, 60 * 1000);
    // 跟随系统：系统深浅色一变就跟着变
    systemLight.addEventListener('change', () => { if (settings().mode === 'system') apply(); });
});
