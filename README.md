# SecondVoice · 第二声音

**写下一句话，让它替你说出来。念的时候可以继续改，随时打断，随时重说。**

在线用：<https://le3334515-tech.github.io/SecondVoice/>

纯前端、零依赖、无构建步骤。文字不出浏览器。

## 为什么做这个

有一类时刻，说话比写字难：要争取时间、要纠正一句被误解的话、要把已经说出口的半句收回来。
SecondVoice 把这件事拆成三个动作 —— **写、说、改**：

- **写**：纸上的草稿是你的，不是被念出去的那一版。
- **说**：文字按你选的音色念出来，逐词高亮，念到哪儿看得见。
- **改**：念到一半按停止，这一版会被完整保留；把句子放回纸上改完再念，改动逐词标出增删。

草稿和"已经交给声音的那一版"是**两件事**。你可以在它念的时候继续改下一句，而正在念的那句不受影响。

## 功能

- 逐词高亮（用 `boundary` 事件；不支持时自动退化为节拍推进）
- **真取消**：停止 = `speechSynthesis.cancel()`，队列和回调一起失效，不是改个标签
- 修订对照：与上一版做词级 LCS 差异，`ins` / `del` 着色 + 增删计数
- 对话记录：念完的、被打断的都留档，可以「修订」或「再念」
- 起手句 + 自存短语（上限 12 条，存在本机）
- 音色 / 语速 / 音高，可试听
- 高对比、大字两种可访问性模式
- 分享链接：整句和参数编码进 URL，打开即还原
- 快捷键：`⌘/Ctrl + ↵` 念出来 · `Esc` 停止 · `R` 修订 · `S` 存为短语

## 逆向来源

产品结构与状态机逆向自 [taranggoyal70/secondvoice](https://github.com/taranggoyal70/secondvoice)（AssemblyAI Hack into Speech 获奖作品，MIT）：它的 `draft / utterance / previousMessage / heard / status / history` 分层、Stop 即真取消、Revise 保留上一版并高亮改动，这些设计与交互被完整沿用。

不同之处：原版依赖 AssemblyAI 的 TTS 与 LLM 接口和 API key；这一版全部改写成浏览器自带的 Web Speech，**不需要任何密钥、不联网调用第三方、打开就能用**，代价是音色来自系统（Windows 上是 Microsoft Huihui 等），音质不如云端。

## 目录

```
index.html      两张纸：草稿 + 声音
styles.css      舞台视觉（深色舞台 / 浅色纸 / 朱红表示"正在发生"）
js/app.js       状态机：ready → speaking → stopped | complete | error
js/speech.js    Web Speech 播报、boundary 映射、真取消、手势解锁
js/text.js      分词（Intl.Segmenter）+ 词级差异（LCS）
js/ribbon.js    绸带：播报状态与断点
js/phrases.js   起手句、自存短语、localStorage
server.mjs      本地静态服务器（仅本地预览用）
```

## 本地跑

```bash
node server.mjs              # http://127.0.0.1:4173
```

或者用任意静态服务器；直接双击 `index.html` 也能跑（`file://` 下剪贴板分享受限）。

## 已知限制

- 音色由系统提供：Windows 只有 Huihui/Yaoyao/Kangkang，Linux 桌面常为空。没有可用语音时界面照常，只是念不出声。
- Safari / Firefox 的 `boundary` 事件不稳定，会退化成按节拍高亮（不算精确到词）。
- 分享链接把整句塞进 URL，超长文本请改用复制。
- 只念你按下按钮的那一版：不做后台朗读、不做自动播放。

## 许可

MIT。产品概念与交互结构来自 taranggoyal70/secondvoice（MIT），视觉与实现为本仓库重写。
