<!--
  主题伴侣 —— SillyTavern 扩展
  作者：mangosagocreamwithpomelo（Discord）
  设计与实现：Claude Opus 5.5（Anthropic）
-->
# 主题伴侣

一个 SillyTavern 扩展，把主题装进酒馆、帮你更新，给主题加一块「主题设置」面板和昼夜开关。以后新出的主题也会放在这里，只装这一个扩展就够了。

## 安装
1. 打开酒馆的「扩展」面板，点「安装扩展」
2. 粘贴 `https://github.com/liangsheng-sys/SillyTavern-Theme-Companion`，然后点安装
3. 扩展会把附带的主题直接存进酒馆（不会弹窗），右上角提示后点一下刷新页面，主题列表里就有了

装给自己还是「给所有用户」都可以，只装一次就行。「给所有用户」装的扩展只有管理员账号能在线更新。

## 主题更新
- 没装过的主题：扩展自动装上最新版
- 装过旧版的：默认**不覆盖**，只提醒一次；到「扩展 → 主题伴侣 → 附带的主题」里点「更新」
- 勾上「自动更新主题」后，有新版本就直接覆盖

更新会覆盖你在「UI 主题」里对这个主题改过的颜色和「自订 CSS」。在本扩展「主题设置」里做的选择存在扩展里，更新后不会丢。
自己删掉的主题不会被自动装回来，想要的话在面板里点「安装」。

## 附带的主题
| 主题 | 说明 |
|---|---|
| 纸上访谈<br>The Interview, on Paper | 当代杂志的访谈页版式，昼夜两版。夜版是石墨底配一抹橙，昼版是米白纸、实墨配古金，五种纸可以换 |
| 银盐显影<br>Silver Gelatin | 黑白摄影暗房。夜里是暗房，白天是展厅；五种调色（硒、无调色、棕褐、铂钯、氰版蓝晒，在「主题设置」里切换，只装一套），角色列表是印样页 |
| 粗野指北<br>Concrete Arrow | 混凝土建筑里的指示系统（灵感来自伦敦巴比肯艺术中心），昼夜两版。聊天栏是炭黑指示柱，消息序号是墙上的楼层号，世界书和预设是楼层索引牌 |
| WPS文档 | 上班摸鱼用：酒馆看起来就是一份在写的 WPS 文档（电脑和手机）。装了本扩展，标尺能拖（页边距、首行缩进），功能区的字体、字号、行距能直接改 |
| XP Messenger | 酒馆变成一台 Windows XP：桌面图标、开始菜单、任务栏就是酒馆的各个面板，聊天是 Windows Messenger 的对话窗口（电脑和手机）。蓝色 / 橄榄绿 / 银色三套配色、桌面壁纸（可以换成酒馆背景）、引号和心理话的样式在「主题设置」里改；装了本扩展还有托盘时钟和一个扫雷 |

不装扩展也能用：直接在「UI 主题」里导入 `themes/` 下的 JSON 文件就行（主题设置和昼夜开关就没有了，主题跟随系统深浅色）。

## 主题设置
「扩展 → 主题伴侣」最上面，或者魔杖菜单 →「主题设置」。内容随当前主题变化，比如银盐显影可以：
- 换调色、记号色（红笔 / 安全灯琥珀）、角色列表样式、正文字体
- 开关光源、颗粒、取景框、边码、展签、显影动画、放大镜……
- 调一行的字数、行高、字重、首行缩进
- 改各处小字（输入框提示、思维链前缀等），留空就不显示
- 换消息时间的写法（酒馆默认 / 胶片日期印 `’26 10 17  21:04` / 月-日 / 只显示时间）

「恢复这套主题的默认设置」可以一键还原。

## 昼夜开关
支持昼夜的主题不装扩展时会跟随系统的深浅色。装上扩展后可以：

- 选择切换方式：
  - 跟随系统（默认）
  - 手动
  - 按时间自动：设定白天从几点到几点，可以跨午夜
- 换昼版用的纸
- 快捷切换：魔杖菜单 →「切换昼 / 夜」，或者用斜杠命令 `/daynight [day|night|toggle|auto|system]`

当前主题不支持昼夜时，这个开关没有任何效果。

## 扩展自己的更新
面板最下面显示版本，可以「检查更新」「更新」，也可以勾上「自动更新扩展」（每天检查一次，默认关）。需要是用 Git 地址安装的。

## 给主题作者
- **加入新主题**：在本仓库的源码里写 `theme.base.json` 的 `version`、`bundle` 和 `companion`（选项声明），构建时会把主题和变体写进 `themes/`，并在 `themes/themes.json` 里登记成一个「系列」。版本号变大以后，用户就会收到更新提示。
- **主题设置的选项**：`companion.options` 里每项是 `{ type, var, label, default, note }`，type 有 `head`（小标题）、`select`（`choices: [[值, 名称]]`，或 `{ value, label, css }` 带一段 CSS）、`toggle`（`on`/`off` 的值，默认 1/0）、`text`（写成 CSS 字符串）、`number`（`min`/`max`/`step`/`unit`）、`color`、`dateformat`。用户改过的值写成 `html:root:root { --变量: 值 }`。
- **主题脚本**：`companion.module: { src, asset }` 会被复制到扩展的 `modules/`。用户用这套主题时扩展 `import` 它并调用默认导出 `fn({ get, set, option })`（读 / 存选项、拿选项声明），返回的函数在换走主题时调用，用来清理。WPS文档的可拖标尺就是这样做的。
- **支持昼夜**：
  - 扩展只会在 `<html>` 上加 `dn-day` / `dn-night` 类和 `data-paper` 属性。主题写 `:root.dn-day { … }` 就能做出昼版。
  - 切换时用浏览器的视图过渡（默认淡入淡出）。切换期间 `<html>` 上有 `data-dn-to="day"|"night"`，主题可以写 `:root[data-dn-to='day']::view-transition-new(root) { animation: … }` 自定动画。
  - 在主题里声明 `--dn-support: 1`，再声明 `--dn-papers: 'id:名称|…'`，扩展里就会出现纸张选项。

## 第三方素材
- **XP Messenger** 的窗口按钮、滚动条、下拉框、复选框图形来自 [XP.css](https://github.com/botoxparty/XP.css)（MIT，Copyright 2020 Adam Hammad, Jordan Scales），许可全文见 `licenses/XP.css-LICENSE`；橄榄绿 / 银色配色参考了 [classic-stylesheets](https://github.com/nielssp/classic-stylesheets)（MIT）；扫雷的玩法参考了 [Minesweeper-XP](https://github.com/AkshayKalose/Minesweeper-XP)，画是重画的。桌面图标、壁纸也都是照样子重新画的，不含微软的原图。XP Messenger 是同人性质的仿制外观，和微软没有任何关系。
