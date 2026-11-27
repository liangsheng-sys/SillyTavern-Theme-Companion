// 小部件单独当「酒馆助手」脚本用：脚本壳（tools/th-scripts.mjs 生成，见 docs/主题伴侣.md「酒馆助手脚本」）
// 叫酒馆主页面 import 本文件（不在脚本自己的 iframe 里，小部件直接操作的是主页面的 document），再由这里载入小部件。
//   默认导出 start({ id, store })：id = widgets.json 里的小部件 id；store = { get(): 选项对象, set(对象) }（壳接到脚本变量上）
//   返回停止函数：卸下小部件、停掉轮询。
// 和主题伴侣同时装着时不抢：伴侣里勾了同一个小部件、或当前主题就是它的来源主题（伴侣会载主题自带的那份）就不载入；
// 当前主题在 themes.json 里声明了 widgetsOff 也不载入。每 2 秒看一次（页面可见时），换主题后自动载入 / 卸下。
// 选项：魔杖菜单「小部件设置」弹窗（酒馆原生 Popup，跟着主题变），改了马上存进脚本变量；小部件本来就是每次用时读选项，不用重载。

const ROOT = new URL('../', import.meta.url);
const json = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw Error(`${r.status} ${u}`); return r.json(); });
let defsP = null, famsP = null, defsList = null;
const defs = () => (defsP ||= json(new URL('widgets/widgets.json', ROOT)).then(l => (defsList = l)));
const fams = () => (famsP ||= json(new URL('themes/themes.json', ROOT)).catch(() => []));

const optKey = o => o.key ?? o.var;
const choicesOf = o => (o.choices || []).map(c => Array.isArray(c) ? { value: c[0], label: c[1] } : c);
function optionValue(o, saved) {   // 和伴侣 index.js 的 optionValue 一样
    const v = saved?.[optKey(o)];
    if (v !== undefined) return v;
    if (o.type === 'toggle') return o.default ?? true;
    if (o.type === 'select') return o.default ?? choicesOf(o)[0]?.value;
    return o.default;
}

const ctx = () => window.SillyTavern?.getContext?.();

// ---- 设置小窗：魔杖菜单一项「小部件设置」，单独装的小部件共用（本模块在主页面里只有一份，几个脚本都登记到这里）
const reg = new Map();   // 小部件 id → { def, opts, api, why() }
let menuItem = null;
const CSS = `
.dnw-set { display: flex; flex-direction: column; gap: 4px; text-align: left; }
.dnw-set h3 { margin: 14px 0 2px; font-size: 1.1em; }
.dnw-set h3:first-child { margin-top: 0; }
.dnw-set .dnw-why { font-size: .9em; font-style: italic; }
.dnw-set .dnw-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 4px 0; }
.dnw-set .dnw-row > span { flex: 1 1 12em; }
.dnw-set .dnw-row select { flex: 0 1 auto; width: auto; max-width: 100%; margin: 0; }
.dnw-set .dnw-row input[type=color] { width: 3em; height: 1.8em; padding: 0; border: none; background: none; }
.dnw-set .dnw-note { flex-basis: 100%; font-size: .85em; line-height: 1.4; }
.dnw-set .dnw-foot { margin-top: 12px; font-size: .85em; }`;

function optionRow(o, api) {
    const row = document.createElement('label');
    row.className = 'dnw-row';
    const name = document.createElement('span');
    name.textContent = o.label || o.key;
    let input;
    if (o.type === 'toggle') {
        row.classList.add('checkbox_label');
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!api.get(o.key);
        input.onchange = () => api.set(o.key, input.checked);
        row.append(input, name);
    } else if (o.type === 'select') {
        input = document.createElement('select');
        input.className = 'text_pole';
        for (const c of choicesOf(o)) input.add(new Option(c.label, c.value));
        input.value = String(api.get(o.key));
        input.onchange = () => api.set(o.key, input.value);
        row.append(name, input);
    } else if (o.type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = String(api.get(o.key) || '#000000');
        input.oninput = () => api.set(o.key, input.value);
        row.append(name, input);
    } else return null;
    if (o.note) {
        const n = document.createElement('small');
        n.className = 'dnw-note';
        n.textContent = o.note;
        row.append(n);
    }
    return row;
}

function openSettings() {
    const c = ctx();
    const box = document.createElement('div');
    box.className = 'dnw-set';
    const style = document.createElement('style');
    style.textContent = CSS;
    box.append(style);
    const order = id => (defsList || []).findIndex(d => d.id === id);
    for (const { def, opts, api, why } of [...reg.values()].sort((a, b) => order(a.def.id) - order(b.def.id))) {
        const h = document.createElement('h3');
        h.textContent = def.label;
        box.append(h);
        const reason = why();
        if (reason) {
            const p = document.createElement('div');
            p.className = 'dnw-why';
            p.textContent = `现在没在用：${reason}`;
            box.append(p);
        }
        const rows = opts.map(o => optionRow(o, api)).filter(Boolean);
        if (!rows.length) {
            const p = document.createElement('div');
            p.className = 'dnw-note';
            p.textContent = '没有可以调的选项。';
            box.append(p);
        }
        box.append(...rows);
    }
    const foot = document.createElement('div');
    foot.className = 'dnw-foot';
    foot.textContent = '改了马上存。要关掉某个小部件：在「酒馆助手 → 脚本库」里关掉它的脚本。';
    box.append(foot);
    if (c?.callGenericPopup) c.callGenericPopup(box, c.POPUP_TYPE.TEXT, '', { okButton: '好了', allowVerticalScrolling: true });
}

function addMenu() {
    if (menuItem) return;
    menuItem = document.createElement('div');
    menuItem.id = 'dnw_settings_menu';
    menuItem.className = 'list-group-item flex-container flexGap5 interactable';
    menuItem.tabIndex = 0;
    menuItem.title = '小部件设置';
    menuItem.innerHTML = '<div class="fa-solid fa-sliders extensionsMenuExtensionButton"></div><span>小部件设置</span>';
    menuItem.addEventListener('click', openSettings);
    menuItem.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSettings(); } });
    document.getElementById('extensionsMenu')?.append(menuItem);
}

// 第一次装上时提示一次设置在哪（每个小部件各一次，记在 localStorage；同时装了几个只弹一条）
const helloQ = [];
let helloT = 0;
function hello(def) {
    const k = `dnw_hello_${def.id}`;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { return; }
    helloQ.push(def.label);
    clearTimeout(helloT);
    helloT = setTimeout(() => {
        const names = helloQ.splice(0).map(n => `「${n}」`).join('');
        window.toastr?.info('调选项：点输入框左边的魔杖 →「小部件设置」', `${names}装好了`, { timeOut: 8000 });
    }, 1500);
}

// 伴侣装着且在跑：它的设置面板在页面上
const companion = () => document.getElementById('daynight_settings') ? ctx()?.extensionSettings?.daynight : null;

export default async function start({ id, store }) {
    const def = (await defs()).find(d => d.id === id);
    if (!def) throw Error(`没有叫 ${id} 的小部件`);
    const families = await fams();
    const shareOpts = def.share ? families.find(f => f.family === def.share)?.options || [] : [];
    const option = key => (def.options || []).find(o => optKey(o) === key) || shareOpts.find(o => optKey(o) === key);
    const tag = `[小部件·${def.label}]`;

    const api = {
        guest: true,
        standalone: true,
        get: key => { const o = option(key); return o ? optionValue(o, store.get()) : undefined; },
        set: (key, v) => {
            const d = { ...store.get() };
            if (v === undefined) delete d[key]; else d[key] = v;
            store.set(d);
        },
        option,
        // 昼夜归伴侣管：没装伴侣就没有（房间菜单会用自己的灯）
        dayNight: cmd => { if (companion()) ctx()?.executeSlashCommandsWithOptions?.(`/daynight ${cmd || 'toggle'}`); },
        dnSupported: () => !!companion() && getComputedStyle(document.documentElement).getPropertyValue('--dn-support').trim() === '1',
        assets: new URL('modules/', ROOT).href,
        autoEnter: () => !!api.get('autoEnter'),
    };

    // 现在该不该开：返回不开的原因，该开返回空串
    const blocked = () => {
        const theme = ctx()?.powerUserSettings?.theme;
        const fam = families.find(f => f.themes?.some(t => t.name === theme));
        const off = fam?.widgetsOff;
        if (off && (Array.isArray(off) ? off.includes(id) : Object.hasOwn(off, id))) return `「${fam.family}」不支持`;
        const c = companion();
        if (c) {
            if (c.widgets?.[id]?.on) return '主题伴侣里已经开着';
            if (def.from && fam?.family === def.from) return `「${def.from}」主题自带`;
        }
        return '';
    };

    let cleanup = null, loading = null, stopped = false, why = null;
    const url = new URL(def.module, ROOT);
    url.searchParams.set('v', String(Date.now() / 36e5 | 0));   // 一小时内用缓存
    async function sync() {
        if (stopped || loading) return;
        const reason = blocked();
        if (reason !== why) { why = reason; if (reason) console.info(tag, '不载入：', reason); }
        if (!reason === !!cleanup) return;
        if (cleanup) {
            const c = cleanup; cleanup = null;
            try { c(); } catch (e) { console.warn(tag, '卸载失败', e); }
            return;
        }
        loading = import(url.href).then(mod => {
            if (stopped || blocked()) return;
            const r = mod.default(api);
            cleanup = typeof r === 'function' ? r : r?.cleanup || (() => {});
            console.info(tag, '已载入');
        }).catch(e => {
            console.error(tag, '载入失败', e);
            why = `载入失败（${e.message || e}）`;
            window.toastr?.error(`「${def.label}」载入失败：${e.message || e}`);
            stopped = true;
        }).finally(() => { loading = null; });
    }
    // 设置小窗里列的：自己的选项 + 共用主题的 shareKeys（藏起来的不列）
    const shown = [...(def.options || []), ...(def.shareKeys || []).map(k => shareOpts.find(o => optKey(o) === k))]
        .filter(o => o && o.key && !o.hidden);
    reg.set(id, { def, opts: shown, api, why: () => (cleanup ? '' : why || blocked()) });
    addMenu();
    hello(def);

    await sync();
    await loading;
    const timer = setInterval(() => { if (!document.hidden) sync(); }, 2000);

    return () => {
        stopped = true;
        clearInterval(timer);
        reg.delete(id);
        if (!reg.size) { menuItem?.remove(); menuItem = null; }
        const c = cleanup; cleanup = null;
        try { c?.(); } catch (e) { console.warn(tag, '卸载失败', e); }
    };
}
