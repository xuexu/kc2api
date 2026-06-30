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

## 开发

```bash
npm test
npm run typecheck
npm run build
```


