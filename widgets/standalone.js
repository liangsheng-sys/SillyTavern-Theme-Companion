// 小部件单独当「酒馆助手」脚本用：脚本壳（tools/th-scripts.mjs 生成，见 docs/主题伴侣.md「酒馆助手脚本」）
// 叫酒馆主页面 import 本文件（不在脚本自己的 iframe 里，小部件直接操作的是主页面的 document），再由这里载入小部件。
//   默认导出 start({ id, store })：id = widgets.json 里的小部件 id；store = { get(): 选项对象, set(对象) }（壳接到脚本变量上）
//   返回停止函数：卸下小部件、停掉轮询。
// 和主题伴侣同时装着时不抢：伴侣里勾了同一个小部件、或当前主题就是它的来源主题（伴侣会载主题自带的那份）就不载入；
// 当前主题在 themes.json 里声明了 widgetsOff 也不载入。每 2 秒看一次（页面可见时），换主题后自动载入 / 卸下。

const ROOT = new URL('../', import.meta.url);
const json = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw Error(`${r.status} ${u}`); return r.json(); });
let defsP = null, famsP = null;
const defs = () => (defsP ||= json(new URL('widgets/widgets.json', ROOT)));
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
            window.toastr?.error(`「${def.label}」载入失败：${e.message || e}`);
            stopped = true;
        }).finally(() => { loading = null; });
    }
    await sync();
    await loading;
    const timer = setInterval(() => { if (!document.hidden) sync(); }, 2000);

    return () => {
        stopped = true;
        clearInterval(timer);
        const c = cleanup; cleanup = null;
        try { c?.(); } catch (e) { console.warn(tag, '卸载失败', e); }
    };
}
