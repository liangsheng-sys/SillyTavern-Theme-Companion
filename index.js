/*
 * 主题伴侣 —— SillyTavern 扩展
 * 作者：mangosagocreamwithpomelo（Discord）
 * 设计与实现：Claude Opus 5.5（Anthropic）
 *
 * 1. 附带的主题：首次加载时用酒馆自己的「导入主题」流程把 themes/ 里的主题加进主题列表；
 *    新版本可以在扩展面板里一键更新。以后的新主题放进 themes/ 并登记到 themes.json 即可。
 * 2. 昼夜开关：给 <html> 加上 dn-day 或 dn-night 类，支持昼夜的主题（如「纸上访谈」）据此换配色。
 *    不装本扩展时，这类主题跟随系统深浅色；装了以后由这里决定。
 *    只改类名和一个 data-paper 属性；当前主题不支持时没有任何效果。
 *    - 手动切换、跟随系统，或按时间自动切换
 *    - 昼版纸张：选项由主题在 CSS 变量 --dn-papers 里提供
 *    - 魔杖菜单里有「切换昼 / 夜」；斜杠命令 /daynight day|night|auto|system|toggle
 */

const KEY = 'daynight';
const CACHE = 'daynight:last';
const DEFAULTS = { mode: 'manual', manual: null, dayStart: '07:00', dayEnd: '19:00', paper: 'default', themes: {} };
const root = document.documentElement;

// 先套用上次的结果，避免加载时先闪一下夜版
try {
    const last = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (last) paint(last.day, last.paper, false);
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

function paint(day, paper, animate = true) {
    const changed = root.classList.contains('dn-day') !== day;
    if (animate && changed && !document.body?.classList.contains('reduced-motion')) {
        root.classList.add('dn-switching');
        clearTimeout(paint.timer);
        paint.timer = setTimeout(() => root.classList.remove('dn-switching'), 700);
    }
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
}

function apply(animate = true) {
    const s = settings();
    // 第一次装上时，「手动」从当前看到的样子（跟随系统的结果）开始，不突然跳变
    if (s.manual !== 'day' && s.manual !== 'night') { s.manual = systemLight.matches ? 'day' : 'night'; save(); }
    const day = wantDay(s);
    paint(day, s.paper, animate);
    try { localStorage.setItem(CACHE, JSON.stringify({ day, paper: s.paper })); } catch { /* 忽略 */ }
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

// ---------- 附带的主题 ----------
const HERE = new URL('.', import.meta.url);
let bundled = [];   // themes/themes.json：[{ name, file, version }]

async function loadBundled() {
    try {
        const r = await fetch(new URL('themes/themes.json', HERE), { cache: 'no-cache' });
        bundled = r.ok ? await r.json() : [];
    } catch { bundled = []; }
}

async function themeText(t) {
    const r = await fetch(new URL(`themes/${encodeURIComponent(t.file)}`, HERE), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`读不到 ${t.file}`);
    return r.text();
}

function installedNames() {
    return new Set([...document.querySelectorAll('#themes option')].map(o => o.value));
}

function isVersion(v) {
    return /^\d/.test(v || '');
}

function newer(a, b) {   // a 比 b 新？
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
}

function waitFor(test, ms) {
    return new Promise(res => {
        const t0 = Date.now();
        const tick = () => test() ? res(true) : Date.now() - t0 > ms ? res(false) : setTimeout(tick, 200);
        tick();
    });
}

// 新装：交给酒馆自己的「导入主题」（会弹出「主题含外部字体」的确认；确认后直接出现在下拉框里，不用刷新）
async function installTheme(t) {
    const input = document.getElementById('ui_preset_import_file');
    if (!input) return false;
    const dt = new DataTransfer();
    dt.items.add(new File([await themeText(t)], t.file, { type: 'application/json' }));
    input.files = dt.files;
    $(input).trigger('change');
    // 酒馆处理完会清空文件框（确认弹窗可能等很久，所以不设短超时）
    await waitFor(() => !input.files?.length, 30 * 60 * 1000);
    const ok = installedNames().has(t.name);
    settings().themes[t.name] = ok ? t.version : 'declined';
    save();
    syncThemes();
    if (ok) {
        const { callGenericPopup, POPUP_TYPE } = ctx();
        if (await callGenericPopup(`已加入主题「${t.name}」。现在就换上吗？`, POPUP_TYPE.CONFIRM)) useTheme(t);
    }
    return ok;
}

// 更新：直接覆盖服务器上的主题文件；酒馆只在启动时读取主题，所以要刷新
async function updateTheme(t) {
    const { callGenericPopup, POPUP_TYPE, getRequestHeaders } = ctx();
    const ask = `把「${t.name}」更新到 ${t.version}？<br><small>会覆盖你在这个主题的颜色和「自订 CSS」里做过的修改。想保留的话，先在「UI 主题」里另存一份。</small>`;
    if (!await callGenericPopup(ask, POPUP_TYPE.CONFIRM)) return;
    const r = await fetch('/api/themes/save', { method: 'POST', headers: getRequestHeaders(), body: await themeText(t) });
    if (!r.ok) { toastr.error('保存失败，请检查酒馆是否在运行', '主题伴侣'); return; }
    settings().themes[t.name] = t.version;
    save();
    toastr.success('页面马上刷新', `「${t.name}」已更新`);
    setTimeout(() => location.reload(), 1800);   // 等设置保存完
}

function useTheme(t) {
    $('#themes').val(t.name).trigger('change');
}

function syncThemes() {
    const box = document.getElementById('dn_themes');
    if (!box) return;
    const have = installedNames();
    const rec = settings().themes;
    box.innerHTML = '';
    for (const t of bundled) {
        const installed = have.has(t.name);
        const stale = installed && rec[t.name] !== t.version && (!isVersion(rec[t.name]) || newer(t.version, rec[t.name]));
        const using = $('#themes').val() === t.name;
        const row = document.createElement('div');
        row.className = 'dn-theme';
        row.innerHTML = '<span class="dn-theme-name"></span><small></small><span class="dn-theme-act"></span>';
        row.children[0].textContent = t.name;
        row.children[1].textContent = !installed ? '未安装' : stale ? `可更新到 ${t.version}` : using ? `${t.version} · 使用中` : t.version;
        const act = row.children[2];
        const btn = (label, fn) => {
            const b = document.createElement('div');
            b.className = 'menu_button';
            b.textContent = label;
            b.onclick = fn;
            act.append(b);
        };
        if (!installed) btn('安装', () => installTheme(t));
        else {
            if (stale) btn('更新', () => updateTheme(t));
            if (!using) btn('使用', () => useTheme(t));
        }
        box.append(row);
    }
    if (!bundled.length) box.textContent = '（没有找到附带的主题）';
}

// 首次加载：自动安装还没装过的；有新版本时提醒一次
async function checkThemes() {
    await loadBundled();
    const s = settings();
    const have = installedNames();
    for (const t of bundled) {
        const rec = s.themes[t.name];
        if (!have.has(t.name)) {
            if (!rec) await installTheme(t);   // 装过又删掉、或拒绝过的，不再自动装，面板里可以手动装
        } else if (!rec) {
            s.themes[t.name] = 'manual';       // 用户自己导入的，版本未知
            save();
        } else if (isVersion(rec) && newer(t.version, rec) && s.notified !== `${t.name}@${t.version}`) {
            s.notified = `${t.name}@${t.version}`;
            save();
            toastr.info(`在「扩展 → 主题伴侣」里可以更新到 ${t.version}`, `「${t.name}」有新版本`, { timeOut: 10000 });
        }
    }
    syncThemes();
}

// ---------- 界面 ----------
const PANEL = `
<div id="daynight_settings" class="daynight-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>主题伴侣</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="dn-head">附带的主题</div>
            <div id="dn_themes"></div>
            <div class="dn-head">昼夜开关</div>
            <div class="dn-unsupported">当前主题不支持昼夜切换。换成「纸上访谈」等支持的主题后，这里的设置才会生效。</div>
            <div class="dn-row">
                <span class="dn-label">切换方式</span>
                <select id="dn_mode" class="text_pole">
                    <option value="manual">手动</option>
                    <option value="system">跟随系统</option>
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
            <small class="dn-note">夜版颜色在「UI 主题」的颜色选择器里改；昼版颜色和其他细节在「自订 CSS」最上方的「可改区」里改。</small>
        </div>
    </div>
</div>`;

const MENU = `
<div id="dn_menu_toggle" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="切换昼 / 夜">
    <div class="fa-solid fa-circle-half-stroke extensionsMenuExtensionButton"></div>
    <span>切换昼 / 夜</span>
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
    $('#dn_menu_toggle').on('click', () => {
        const was = settings().mode;
        setMode('toggle');
        if (was !== 'manual') toastr.info(`已从「${was === 'auto' ? '按时间自动' : '跟随系统'}」改为手动，可在扩展设置里改回。`, '昼夜开关');
    });
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
    // 换主题时刷新面板（新主题可能不支持，或纸张列表不同）
    const { eventSource, eventTypes } = ctx();
    if (eventTypes?.SETTINGS_UPDATED) eventSource.on(eventTypes.SETTINGS_UPDATED, syncUi);
    $(document).on('change', '#themes', () => setTimeout(() => { syncUi(); syncThemes(); }, 300));
    // 等酒馆把主题列表填好再检查附带的主题（APP_READY 已经发生过的话会立刻触发）
    eventSource.on(eventTypes.APP_READY, () => checkThemes().catch(e => console.warn('[主题伴侣] 检查主题失败', e)));
    // 按时间自动：每分钟看一次
    setInterval(() => { if (settings().mode === 'auto') apply(); }, 60 * 1000);
    // 跟随系统：系统深浅色一变就跟着变
    systemLight.addEventListener('change', () => { if (settings().mode === 'system') apply(); });
});
