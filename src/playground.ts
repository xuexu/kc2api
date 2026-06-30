export function renderPlaygroundHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kimchi2API Model Playground</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #0f172a; color: #e2e8f0; }
    .shell { max-width: 1280px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .subtle { color: #94a3b8; margin: 0 0 20px; }
    .grid { display: grid; grid-template-columns: minmax(320px, 0.85fr) minmax(360px, 1.15fr); gap: 16px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.24); }
    label { display: block; font-weight: 650; margin: 12px 0 6px; color: #cbd5e1; }
    input, select, textarea, button { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid #475569; background: #020617; color: #e2e8f0; padding: 10px 12px; font: inherit; }
    textarea { min-height: 104px; resize: vertical; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .inline { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
    .inline input { width: auto; }
    button { cursor: pointer; background: #2563eb; border-color: #3b82f6; font-weight: 750; margin-top: 14px; }
    button.secondary { background: #1e293b; border-color: #475569; }
    button:disabled { opacity: .65; cursor: not-allowed; }
    pre { white-space: pre-wrap; word-break: break-word; background: #020617; border: 1px solid #334155; border-radius: 12px; padding: 12px; min-height: 96px; max-height: 420px; overflow: auto; }
    .status { display: flex; gap: 12px; flex-wrap: wrap; color: #cbd5e1; margin-bottom: 10px; }
    .pill { border: 1px solid #334155; border-radius: 999px; padding: 5px 10px; background: #020617; }
    .error { color: #fecaca; }
    .tabs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
    .tabs button { width: auto; margin: 0; padding: 7px 10px; background: #1e293b; }
    .panel { display: none; }
    .panel.active { display: block; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="shell">
    <h1>Kimchi2API Model Playground</h1>
    <p class="subtle">通过本中转站测试 Kimchi 上游模型；请求会发往同源 <code>/v1/chat/completions</code>。Playground v0.4-stream-diagnostics</p>

    <div class="grid">
      <section class="card">
        <label for="apiKey">PUBLIC_API_KEY（如已配置）</label>
        <input id="apiKey" type="password" placeholder="未配置可留空" autocomplete="off" />

        <label for="model">模型</label>
        <select id="model"><option value="">加载模型中...</option></select>

        <label for="system">System Prompt</label>
        <textarea id="system" placeholder="你是一个有帮助的助手。">你是一个有帮助的助手。</textarea>

        <label for="user">User Prompt</label>
        <textarea id="user" placeholder="输入测试问题...">你好，请用一句话介绍你自己。</textarea>

        <div class="row">
          <div>
            <label for="temperature">Temperature</label>
            <input id="temperature" type="number" min="0" max="2" step="0.1" value="0.7" />
          </div>
          <div>
            <label for="maxTokens">Max Tokens</label>
            <input id="maxTokens" type="number" min="1" step="1" value="1024" />
          </div>
        </div>

        <label class="inline"><input id="stream" type="checkbox" checked /> 使用流式输出</label>
        <button id="send">发送测试</button>
        <button id="reload" class="secondary" type="button">重新加载模型</button>
      </section>

      <section class="card">
        <div class="status">
          <span class="pill">状态：<strong id="httpStatus">待发送</strong></span>
          <span class="pill">耗时：<strong id="elapsed">-</strong></span>
        </div>
        <label>助手输出</label>
        <pre id="output"></pre>

        <div class="tabs">
          <button type="button" data-tab="requestPanel">Raw Request</button>
          <button type="button" data-tab="responsePanel">Raw Response / 调试响应</button>
          <button type="button" data-tab="errorPanel">Errors</button>
          <button id="copyRaw" type="button" class="secondary">复制 Raw Response</button>
        </div>
        <div id="requestPanel" class="panel active"><pre id="rawRequest"></pre></div>
        <div id="responsePanel" class="panel"><pre id="rawResponse"></pre></div>
        <div id="errorPanel" class="panel"><pre id="errors" class="error"></pre></div>
      </section>
    </div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id)
    const apiKeyInput = $("apiKey")
    const modelSelect = $("model")
    const output = $("output")
    const rawRequest = $("rawRequest")
    const rawResponse = $("rawResponse")
    const errors = $("errors")
    const httpStatus = $("httpStatus")
    const elapsed = $("elapsed")
    const send = $("send")

    apiKeyInput.value = localStorage.getItem("kimchi2api_public_api_key") || ""
    apiKeyInput.addEventListener("input", () => localStorage.setItem("kimchi2api_public_api_key", apiKeyInput.value))

    function headers(extra = {}) {
      const h = { ...extra }
      if (apiKeyInput.value.trim()) h.Authorization = "Bearer " + apiKeyInput.value.trim()
      return h
    }

    function showError(error) {
      errors.textContent = error && error.stack ? error.stack : String(error)
    }

    function appendDebug(line) {
      errors.textContent += (errors.textContent ? "\n" : "") + line
    }

    function responseHeadersDebug(res) {
      const headers = {}
      res.headers.forEach((value, key) => { headers[key] = value })
      return JSON.stringify(headers, null, 2)
    }

    function appendDebug(line) {
      errors.textContent += (errors.textContent ? "\n" : "") + line
    }

    function responseHeadersDebug(res) {
      const headers = {}
      res.headers.forEach((value, key) => { headers[key] = value })
      return JSON.stringify(headers, null, 2)
    }

    function extractErrorMessage(parsed) {
      if (!parsed) return ""
      if (typeof parsed.error === "string") return parsed.error
      if (parsed.error?.message) return parsed.error.message
      if (parsed.message && (parsed.type === "error" || parsed.code || parsed.status)) return parsed.message
      return ""
    }

    function surfaceUpstreamError(parsed, statusText = "") {
      const message = extractErrorMessage(parsed)
      if (!message) return false
      const text = "上游错误" + (statusText ? " (" + statusText + ")" : "") + ": " + message
      errors.textContent = text
      output.textContent = text
      activateTab("errorPanel")
      return true
    }

    async function loadModels() {
      modelSelect.innerHTML = '<option value="">加载模型中...</option>'
      errors.textContent = ""
      try {
        const res = await fetch("/v1/models", { headers: headers() })
        const text = await res.text()
        if (!res.ok) throw new Error("加载模型失败 HTTP " + res.status + ": " + text)
        const body = JSON.parse(text)
        modelSelect.innerHTML = ""
        for (const model of body.data || []) {
          const option = document.createElement("option")
          option.value = model.id
          option.textContent = model.id + (model.owned_by ? " · " + model.owned_by : "")
          modelSelect.appendChild(option)
        }
        if (!modelSelect.options.length) modelSelect.innerHTML = '<option value="">无可用模型</option>'
      } catch (error) {
        modelSelect.innerHTML = '<option value="">模型加载失败</option>'
        showError(error)
      }
    }

    function buildPayload() {
      const messages = []
      if ($("system").value.trim()) messages.push({ role: "system", content: $("system").value })
      messages.push({ role: "user", content: $("user").value })
      return {
        model: modelSelect.value,
        messages,
        temperature: Number($("temperature").value),
        max_tokens: Number($("maxTokens").value),
        stream: $("stream").checked,
      }
    }

    function extractTextFromContentParts(parts) {
      if (!Array.isArray(parts)) return ""
      return parts
        .map((part) => {
          if (typeof part === "string") return part
          return part?.text || part?.content || part?.input_text || part?.output_text || ""
        })
        .join("")
    }

    function extractAssistantText(parsed) {
      return parsed.choices?.[0]?.delta?.content
        || parsed.choices?.[0]?.delta?.reasoning_content
        || parsed.choices?.[0]?.delta?.text
        || parsed.choices?.[0]?.message?.content
        || parsed.choices?.[0]?.text
        || parsed.data?.choices?.[0]?.delta?.content
        || parsed.data?.choices?.[0]?.delta?.text
        || parsed.data?.choices?.[0]?.message?.content
        || parsed.delta?.text
        || parsed.delta?.content
        || parsed.content_block_delta?.delta?.text
        || parsed.content_block?.text
        || (parsed.type === "response.output_text.delta" ? parsed.delta : "")
        || parsed.text
        || parsed.content
        || extractTextFromContentParts(parsed.output)
        || extractTextFromContentParts(parsed.content)
        || extractTextFromContentParts(parsed.message?.content)
        || parsed.output_text
        || ""
    }

    function renderAssistantOutput(parsedOrText) {
      if (typeof parsedOrText === "string") {
        output.textContent = parsedOrText
        return
      }
      output.textContent = extractAssistantText(parsedOrText) || JSON.stringify(parsedOrText, null, 2)
    }

    const streamJsonEvents = []
    const streamTextEvents = []

    function looksLikeJson(text) {
      const trimmed = text.trim()
      return trimmed.startsWith("{") || trimmed.startsWith("[")
    }

    function formatJsonLine(line) {
      const trimmed = line.trim()
      if (!looksLikeJson(trimmed)) return line
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return line
      }
    }

    function formatSseForDisplay(text) {
      return text
        .split(/\r?\n/)
        .map((line) => {
          if (!line.trimStart().startsWith("data:")) return line
          const dataIndex = line.indexOf("data:")
          const prefix = dataIndex >= 0 ? line.slice(0, dataIndex + 5) : "data:"
          const data = line.trimStart().slice(5).trim()
          if (!data || data === "[DONE]") return line
          return prefix + " " + formatJsonLine(data)
        })
        .join("\n")
    }

    function formatRawResponse(text, contentType = "") {
      if (!text) return ""
      if (contentType.includes("text/event-stream") || text.includes("data:")) return formatSseForDisplay(text)
      const trimmed = text.trim()
      if (looksLikeJson(trimmed)) return formatJsonLine(trimmed)
      return text
    }

    function processSseEvent(eventText) {
      const data = eventText
        .split(/\r?\n/)
        .filter((line) => line.trimStart().startsWith("data:"))
        .map((line) => line.trimStart().slice(5).trim())
        .join("\n")
      if (!data || data === "[DONE]") return
      if (!looksLikeJson(data)) {
        streamTextEvents.push(data)
        output.textContent += data
        return
      }
      try {
        const parsed = JSON.parse(data)
        streamJsonEvents.push(parsed)
        surfaceUpstreamError(parsed)
        const delta = extractAssistantText(parsed)
        if (delta) output.textContent += delta
      } catch (error) {
        errors.textContent += (errors.textContent ? "\n" : "") + "SSE parse skipped: " + String(error) + "\nEvent: " + eventText
      }
    }

    function activateTab(panelId) {
      document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"))
      $(panelId).classList.add("active")
    }

    async function sendRequest() {
      const payload = buildPayload()
      rawRequest.textContent = JSON.stringify(payload, null, 2)
      rawResponse.textContent = ""
      output.textContent = ""
      errors.textContent = ""
      streamJsonEvents.length = 0
      streamTextEvents.length = 0
      httpStatus.textContent = "发送中"
      elapsed.textContent = "-"
      send.disabled = true
      const started = performance.now()
      try {
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        })
        httpStatus.textContent = String(res.status)
        activateTab("responsePanel")
        const contentType = res.headers.get("content-type") || ""
        appendDebug("HTTP " + res.status + " " + res.statusText + "; content-type=" + contentType + "; body=" + (res.body ? "present" : "empty"))
        appendDebug("Response headers: " + responseHeadersDebug(res))
        if (payload.stream && res.body && contentType.includes("text/event-stream")) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let all = ""
          let streamBuffer = ""
          let chunkCount = 0
          let byteLength = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              appendDebug("Browser stream done: chunks=" + chunkCount + ", bytes=" + byteLength + ", chars=" + all.length)
              if (streamBuffer.trim()) processSseEvent(streamBuffer)
              break
            }
            chunkCount += 1
            byteLength += value?.byteLength || 0
            appendDebug("Browser stream chunk #" + chunkCount + ": bytes=" + (value?.byteLength || 0))
            chunkCount += 1
            byteLength += value?.byteLength || 0
            appendDebug("Browser stream chunk #" + chunkCount + ": bytes=" + (value?.byteLength || 0))
            const chunk = decoder.decode(value, { stream: true })
            all += chunk
            streamBuffer += chunk
            rawResponse.textContent = formatRawResponse(all, contentType)
            const events = streamBuffer.split(/\r?\n\r?\n/)
            streamBuffer = events.pop() || ""
            for (const eventText of events) processSseEvent(eventText)
          }
          if (!output.textContent.trim()) {
            output.textContent = streamJsonEvents.length
              ? "流式响应已结束，但未解析到标准文本字段。以下是已收到的 SSE JSON 摘要：\n" + JSON.stringify(streamJsonEvents.slice(-5), null, 2)
              : "流式响应已结束，但没有收到可解析的 SSE JSON。原始流内容：\n" + (all || streamTextEvents.join("\n") || "（空）")
          }
        } else {
          const text = await res.text()
          rawResponse.textContent = formatRawResponse(text, contentType)
          try {
            const json = JSON.parse(text)
            if (!surfaceUpstreamError(json, String(res.status))) renderAssistantOutput(json)
          } catch {
            renderAssistantOutput(text)
          }
        }
      } catch (error) {
        httpStatus.textContent = "ERR"
        showError(error)
      } finally {
        elapsed.textContent = Math.round(performance.now() - started) + " ms"
        send.disabled = false
      }
    }

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tab)
      })
    })

    $("send").addEventListener("click", sendRequest)
    $("reload").addEventListener("click", loadModels)
    $("copyRaw").addEventListener("click", async () => {
      await navigator.clipboard.writeText(rawResponse.textContent || "")
    })
    loadModels()
  </script>
</body>
</html>`
}
