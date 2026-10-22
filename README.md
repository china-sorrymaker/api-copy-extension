# API Copy

Chrome DevTools 接口调试复制助手 · A request-copy helper for Chrome DevTools

**v1.4.2** · [中文](#中文) · [English](#english) · [下载 / Downloads](https://github.com/china-sorrymaker/api-copy-extension/releases/latest)

## 中文

API Copy 在 Chrome 开发者工具中增加一个面板，将接口地址、入参、请求头和响应整理后复制，方便排查问题和分享调试信息。

### 下载与安装

1. 从 [Releases](https://github.com/china-sorrymaker/api-copy-extension/releases/latest) 下载 `api-copy-extension-v1.4.2.zip`，然后解压。请下载发布包，而非 GitHub 自动生成的 Source code 压缩包。
2. 打开 `chrome://extensions`，开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后的 `api-copy-extension` 文件夹（其中应直接包含 `manifest.json`）。
4. 在普通网页关闭并重新打开 F12，选择 **API Copy**。如果没有显示，请在开发者工具顶部的 `>>` 菜单中查找。
5. 刷新页面或触发接口请求，在左侧选择请求后复制。

更新时，用新版文件替换原安装目录的文件，在扩展管理页点击“重新加载”，再关闭并重新打开 F12。保持原安装目录有助于保留本地配置。

### 功能

- 主要展示 Fetch/XHR 接口，过滤 JS、CSS、图片、字体、HTML 等静态资源，最多保留 300 条记录。
- 支持按 URL、请求方法、状态码筛选，以及“仅异常”筛选。
- 左右分栏可拖动，宽度自动保存；右上角齿轮打开脱敏设置，默认收起，点击外部或按 Esc 关闭。
- JSON 响应使用折叠树，折叠行显示 `{id: "...", operationTime: "...", …}` 等字段摘要；数组显示长度及内容轮廓。
- 字段、字符串、数字、布尔值和 null 以不同颜色区分，长行可横向滚动，支持全部展开或折叠。
- 按需创建树节点；新请求到来及切换请求时，保留各请求的展开与滚动位置。
- 工具栏图标可查看 DevTools 页面加载及面板注册状态。

### 复制方式

| 操作 | 内容 |
| --- | --- |
| 完整复制 | 方法、URL、状态、耗时、入参、已脱敏请求头、完整响应 |
| 精简复制 | 相同的调试上下文，加响应摘要；数组只展示前两条示例 |
| 复制 URL | 包含协议、域名、路径及查询参数的完整地址 |
| 复制 URI | 仅路径及查询参数，不含协议和域名 |
| 复制入参 | 只复制参数数据，JSON Body 不带 `Body:` 前缀 |
| 复制返回值 | 完整格式化响应，不受折叠摘要截断影响 |

左侧每条请求旁的“复制”按钮等同于完整复制。

单独复制入参时：

- 只有 JSON Body：直接输出 JSON，保留空对象、空数组、null 和其他合法 JSON 值。
- 只有 Query：转为 JSON；值保留字符串，重复参数转为数组，避免把 `"001"` 转成 `1`。
- 同时有 Query 和 Body：按 `query`、`body` 分组，避免同名字段覆盖。
- 表单参数转为 JSON；非 JSON 文本 Body 保留文本；不复制文件内容。无入参时显示“无入参”。

```json
{
  "query": {
    "shopId": "001",
    "tag": ["a", "b"]
  },
  "body": {
    "current": 1,
    "size": 20
  }
}
```

完整复制、精简复制及页面展示继续保留 `Query:` / `Body:` 标记，以区分来源。

### 请求状态

- 尚未收到 HTTP 响应时显示 `waiting`，不当作错误，也不进入“仅异常”结果。
- 请求完成时在原记录上更新状态，保持选中项，不因 `0 → 200` 生成重复记录。
- 完成事件确认的网络失败，或 HAR 中明确的网络错误，才显示 `ERR`；HTTP 错误显示实际状态码。
- 业务异常识别包括 `success=false` 以及非内置成功值的 `code`。内置成功值为 `0`、`200`、`20000`、`SUCCESS`、`success`，其他接口约定可能需要调整。
- 晚到的 waiting 快照不会覆盖已确认的完成状态；清空中的请求随后完成也不会重新加入列表。

### 脱敏与隐私

- 普通请求头、普通自定义业务头默认保留明文。
- Auth、Token、Cookie、Secret、Api-Key、Credential、Session 等敏感头，以及以 Bearer / Basic / Token / crypto 开头的认证内容自动脱敏。
- 在齿轮设置中的“不允许明文的请求头”填写额外头名，例如 `company-ticket, login-sign`。按完整名称匹配，忽略大小写，支持逗号、分号和空白分隔，不支持通配符。留空仍保留内置规则。
- 可设置首尾保留长度及星号数量；短值显示 `[REDACTED]`。配置自动保存到本地。
- URL / Query / JSON Body / JSON 响应中命中敏感字段名的数据也会处理。脱敏依赖字段名和已知认证格式，并非对任意文本中所有秘密的自动识别；特殊凭据头请加入额外名单。
- 插件读取 DevTools 已捕获的数据，不主动重发接口，也不上传捕获的请求。设置只影响插件展示及复制结果，不修改实际网络请求。
- 仅申请 `clipboardWrite` 和 `storage` 权限，无需 debugger 或额外网站访问权限。

### 验证与限制

开发检查，在插件目录执行（需要支持 `node:test` 的 Node.js）：

```sh
node --test tests/*.test.js
```

手动验证：在 Network 中启用限速并触发接口，确认单条记录从 `waiting` 更新为最终状态；测试网络失败、纯 JSON 入参复制、Query / Body 分组、URL / URI、额外请求头脱敏和 JSON 折叠状态。

插件每 1.2 秒通过 HAR 快照同步请求集合。Chrome 不提供原生 Network 的 UI 筛选器及专用 Clear 事件，因此插件与 Network 面板不保证强一致。未被 Chrome 标记为 Fetch/XHR、且未命中内容类型规则的 text/plain 接口可能不会显示。响应正文被 Chrome 清理时，重试读取也可能无法恢复。

本版通过 32 项本地自动测试及模拟 HAR / 完成事件的 Chrome 页面交互检查；真实站点 DevTools 仍需按上述步骤验收。

---

## English

API Copy adds a Chrome DevTools panel that collects request URLs, parameters, headers and responses into readable clipboard output for debugging and sharing.

### Download and install

1. Download `api-copy-extension-v1.4.2.zip` from [Releases](https://github.com/china-sorrymaker/api-copy-extension/releases/latest) and extract it. Use the release asset rather than GitHub's automatically generated Source code archive.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `api-copy-extension` folder containing `manifest.json`.
4. Close and reopen DevTools on a regular web page, then select **API Copy**. Check the `>>` menu if the panel is hidden.
5. Refresh the page or trigger an API request, select a request and copy the information you need.

To update, replace the files in the existing installation folder, reload the extension and reopen DevTools. Keeping the installation path helps preserve local settings. The extension UI currently uses Chinese; this README provides both languages.

### Features

- Captures mainly Fetch/XHR requests, filters static resources and keeps up to 300 records.
- Filters requests by URL, method or status, with an errors-only option.
- Resizable request/detail columns with saved widths. The top-right gear opens collapsed-by-default redaction settings; click outside or press Esc to close.
- Chrome-style JSON previews show field summaries such as `{id: "...", operationTime: "...", …}`, array lengths and nested structure hints.
- Distinct colors for keys, strings, numbers, booleans and null, horizontal scrolling for long lines, and expand/collapse-all actions.
- Lazy tree rendering with expansion and scroll state preserved when new requests arrive or selected requests change.
- The extension toolbar popup reports DevTools page loading and panel registration status.

### Copy actions

| UI label | Output |
| --- | --- |
| 完整复制 / Full copy | Method, URL, status, duration, parameters, redacted headers and full response |
| 精简复制 / Compact copy | The same request context with a response summary; arrays include up to two samples |
| 复制 URL / Copy URL | Full address including scheme, host, path and query parameters |
| 复制 URI / Copy URI | Path and query parameters, without scheme or host |
| 复制入参 / Copy parameters | Parameter data only; JSON request bodies have no `Body:` prefix |
| 复制返回值 / Copy response | Full formatted response, unaffected by collapsed preview truncation |

The copy button beside each request performs a full copy.

Parameter-only copying follows these rules:

- JSON Body only: outputs JSON directly, preserving empty objects, arrays, null and other valid JSON values.
- Query only: outputs a JSON object with string values; repeated names become arrays. Values such as `"001"` retain leading zeros.
- Both Query and Body: outputs separate `query` and `body` properties, as shown in the example above, to avoid overwriting matching names.
- Form parameters become JSON; non-JSON text bodies remain text. File contents are excluded. No parameters produces `无入参` (no parameters).

Full/compact copies and the detail panel retain `Query:` / `Body:` labels to identify their source.

### Request lifecycle

- Requests awaiting an HTTP response display `waiting` and are excluded from the errors-only filter.
- Completion updates the existing record and preserves its selection; a `0 → 200` transition does not create another row.
- `ERR` requires a confirmed finished network failure or explicit HAR error information. HTTP failures display their actual status codes.
- Business error detection recognizes `success=false` and non-success `code` values. Recognized success codes are `0`, `200`, `20000`, `SUCCESS` and `success`; other API conventions may require changes.
- A delayed waiting snapshot cannot overwrite a confirmed result. Requests cleared while pending stay hidden after completion.

### Redaction and privacy

- Ordinary and custom business headers remain readable by default.
- Sensitive names including Auth, Token, Cookie, Secret, Api-Key, Credential and Session, plus Bearer / Basic / Token / crypto authentication values, are automatically masked.
- Add extra header names under **不允许明文的请求头** (headers that must be redacted), for example `company-ticket, login-sign`. Matching is exact and case-insensitive, with comma, semicolon or whitespace separators; wildcards are not supported. Built-in rules remain active when the list is empty.
- Configure visible prefix/suffix lengths and the number of masking stars. Short values become `[REDACTED]`. Settings are saved locally.
- Matching sensitive field names in URLs, query parameters, JSON bodies and JSON responses are also redacted. Rules depend on names and known authentication formats; they do not detect every secret in arbitrary text. Add unusual credential headers to the extra list.
- The extension reads data already captured by DevTools. It does not replay requests or upload captured data. Settings affect extension display and clipboard output, without modifying actual network requests.
- Only `clipboardWrite` and `storage` permissions are requested; no debugger or additional website access permissions are required.

### Validation and limitations

Run from the extension directory with a Node.js version supporting `node:test`:

```sh
node --test tests/*.test.js
```

For manual checks, throttle requests in Network and verify a single row transitions from `waiting` to its final status. Also check network failures, JSON-only parameter copies, grouped Query/Body copies, URL/URI output, extra-header redaction and preserved JSON tree state.

The panel reconciles HAR snapshots every 1.2 seconds. Chrome does not expose Network's UI filters or a dedicated Clear event, so exact synchronization is not guaranteed. Plain-text endpoints without Fetch/XHR classification or matching content-type rules may be filtered out. Response bodies already discarded by Chrome may remain unavailable after retrying.

This version passed 32 local automated tests and Chrome page interaction checks using simulated HAR snapshots and completion events. Real-site DevTools acceptance remains a separate manual check.
