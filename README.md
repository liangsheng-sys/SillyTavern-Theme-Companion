<!--
  主题伴侣 —— SillyTavern 扩展
  作者：mangosagocreamwithpomelo（Discord）
  设计与实现：Claude Opus 5.5（Anthropic）
-->
# 主题伴侣

一个 SillyTavern 扩展，把主题装进酒馆，并给支持昼夜的主题加一个开关。以后新出的主题也会放在这里，只装这一个扩展就够了。

## 安装
1. 打开酒馆的「扩展」面板，点「安装扩展」
2. 粘贴 `https://github.com/liangsheng-sys/SillyTavern-Theme-Companion`，然后点安装
3. 扩展装好后会自动导入附带的主题。酒馆会提示「主题里有 @import」，那是加载字体用的，点「是」就行。然后选择要不要马上换上

以后更新扩展时，如果附带的主题有新版本，酒馆会提示一次。到「扩展 → 主题伴侣」里点「更新」就能更新，页面会自动刷新。
注意：更新会覆盖你对这个主题做过的修改。如果想保留，先在「UI 主题」里另存一份。

## 附带的主题
| 主题 | 说明 |
|---|---|
| 纸上访谈 | 当代杂志的访谈页版式，昼夜两版。夜版是石墨底配一抹橙，昼版是米白纸、实墨配古金，五种纸可以换 |

不装扩展也能用：直接在「UI 主题」里导入 `themes/` 下的 JSON 文件就行。

## 昼夜开关
支持昼夜的主题不装扩展时会跟随系统的深浅色。装上扩展后可以：

- 选择切换方式：
  - 跟随系统（默认）
  - 手动
  - 按时间自动：设定白天从几点到几点，可以跨午夜
- 换昼版用的纸
- 快捷切换：魔杖菜单 →「切换昼 / 夜」，或者用斜杠命令 `/daynight [day|night|toggle|auto|system]`

当前主题不支持昼夜时，这个开关没有任何效果。

## 给主题作者
- **加入新主题**：把主题 JSON 放进 `themes/`，再在 `themes/themes.json` 里登记 `{ "name", "file", "version" }`。版本号变大以后，用户就会收到更新提示。
- **支持昼夜**：
  - 扩展只会在 `<html>` 上加 `dn-day` / `dn-night` 类和 `data-paper` 属性。主题写 `:root.dn-day { … }` 就能做出昼版。
  - 切换时用浏览器的视图过渡（默认淡入淡出）。切换期间 `<html>` 上有 `data-dn-to="day"|"night"`，主题可以写 `:root[data-dn-to='day']::view-transition-new(root) { animation: … }` 自定动画。
  - 在主题里声明 `--dn-support: 1`，再声明 `--dn-papers: 'id:名称|…'`，扩展里就会出现纸张选项。
