# kc2api

## 功能

- `GET /v1/models`：从 KC metadata 接口拉取模型并转换成 OpenAI 模型列表格式。
- `POST /v1/chat/completions`：转发到 KC `/openai/v1/chat/completions`。
- `POST /v1/responses`：通过 catch-all 转发到 KC `/openai/v1/responses`。
- 其它 `/v1/*`：转发到 KC `/openai/v1/*`，便于兼容新增 OpenAI 风格接口。
- 支持 SSE streaming 透传。
- 支持可选的下游 `PUBLIC_API_KEY` 鉴权。
- 转发 chat completions 时会模拟 KC CLI 的关键请求特征：`User-Agent: kimchi/...`、`tags: ["model:<id>", "phase:relay"]`，并兼容把外部传入的 `kimchi-dev/<model>` 规范化为上游需要的 `<model>`。
- 模块化结构，后续可升级到模型别名、过滤、默认模型、参数改写等方案 B 能力。

## 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 KIMCHI_API_KEY
npm run dev
```

或直接设置环境变量：

```bash
$env:KIMCHI_API_KEY="你的 KC API Key"
npm run dev
```

服务默认监听：

```text
http://127.0.0.1:3000/v1
```

## 配置

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `PORT` | `3000` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `KIMCHI_API_KEY` | 无 | 访问 KC 上游的 API key，运行服务必填 |
| `KIMCHI_BASE_URL` | `https://llm.kimchi.dev` | KC 上游地址 |
| `KIMCHI_USER_AGENT` | `kimchi/0.1.52` | 发往上游的 User-Agent，默认模拟 KC CLI |
| `KIMCHI_MODEL_LIST_SOURCE` | `metadata` | `/v1/models` 的上游来源。默认 `metadata` 只展示 KC metadata 中实际可用的 CLI 模型；设为 `openai` 时改用 `/openai/v1/models` 展示完整 OpenAI-compatible 列表 |
| `PUBLIC_API_KEY` | 空 | 如果设置，下游客户端必须发送 `Authorization: Bearer <PUBLIC_API_KEY>` |
| `REQUEST_TIMEOUT_MS` | `120000` | 上游请求超时时间 |


## 模型演练场

启动服务后打开：

```text
http://127.0.0.1:3000/playground
```

演练场提供：

- 模型下拉框，会从 `/v1/models` 自动加载。
- `PUBLIC_API_KEY` 输入框；如果服务端配置了 `PUBLIC_API_KEY`，在这里填入，浏览器会保存到 localStorage。
- System/User prompt 输入。
- `temperature`、`max_tokens` 和 streaming 开关。
- 助手输出、HTTP 状态、耗时、Raw Request、Raw Response 和错误面板。

根路径 `/` 会自动跳转到 `/playground`。

## OpenAI 客户端示例

### curl

```bash
curl http://127.0.0.1:3000/v1/models
```

```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4.1","messages":[{"role":"user","content":"hi"}]}'
```

如果设置了 `PUBLIC_API_KEY`：

```bash
curl http://127.0.0.1:3000/v1/models \
  -H "Authorization: Bearer your-public-key"
```

### OpenAI SDK

```ts
import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "http://127.0.0.1:3000/v1",
  apiKey: "任意值或 PUBLIC_API_KEY",
})

const models = await client.models.list()
```


## 模型加载失败排查

打开 `/playground` 时如果模型下拉框显示“模型加载失败”，先看运行 `npm run dev` 的后台日志。

`GET /v1/models` 现在会打印以下事件：

- `models.metadata.request`：开始请求 KC metadata，包含 upstream URL。
- `models.metadata.response`：上游返回成功，包含 HTTP 状态、原始模型数量、转换后的 OpenAI 模型数量、耗时。
- `models.metadata.upstream_error`：上游返回非 2xx，包含状态码、状态文本、响应体预览、耗时。
- `models.metadata.invalid_shape`：上游返回 JSON 结构不是 `{ models: [...] }`。
- `models.metadata.exception`：网络错误、DNS、超时等异常。

如果设置 `KIMCHI_MODEL_LIST_SOURCE=openai`，事件名前缀会变为 `models.openai.*`，并请求 KC 的 `/openai/v1/models`。该模式可能显示一些当前账号/Provider 暂不可调用的模型，调用失败时后台 `openai.proxy.body` 会包含上游错误的 `bodyPreview`，便于看到类似 `no registered providers found for the requested model` 的原因。

日志不会打印 `KIMCHI_API_KEY`、`PUBLIC_API_KEY` 或 `Authorization` header。


### 状态 200 但没有助手输出

如果演练场右侧显示 `状态：200`，但“助手输出”为空：

1. 页面会自动切到 `Raw Response / 调试响应` 面板，先看原始响应。
2. 后台会打印：
   - `openai.proxy.request`：转发到 KC OpenAI-compatible 上游的 URL。
   - `openai.proxy.response`：上游状态码、Content-Type、耗时。
   - `openai.proxy.exception`：转发异常。
3. 如果 Raw Response 有内容但助手输出为空，通常是上游返回格式不是标准 `choices[0].delta.content` 或 `choices[0].message.content`；页面会直接显示原始 JSON 或提示查看 Raw Response。
4. 如果 Raw Response 也为空，但状态是 200，看后台 `openai.proxy.response` 的 `contentType`，确认上游是否真的返回了 `text/event-stream` 或 JSON。

常见原因：

- 浏览器演练场里填了错误的 `PUBLIC_API_KEY`。
- `.env` 中 `KIMCHI_API_KEY` 无效或没有权限。
- `KIMCHI_BASE_URL` 配错。
- 本机网络无法访问 KC upstream。
- 上游返回 401/403/5xx。

## 开发

```bash
npm test
npm run typecheck
npm run build
```


