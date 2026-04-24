// background.js - LLM API 调用与文件下载

let currentController = null;

function buildPrompt(extractedData) {
  const systemPrompt = `你是一名资深 UI/UX 设计师，擅长将网页的原始样式数据整理为专业、结构化的 DESIGN.md 设计系统文档。

DESIGN.md 是 Google Stitch 创建的设计系统单文件格式，用于 AI 原生开发。它作为设计意图与 AI 生成代码之间的桥梁，需要包含以下章节：

## 必须包含的章节
1. **Overview** (2-3 段)：设计系统概述、风格定位、视觉气质、适用场景。用生动的设计语言描述。
2. **Colors**：品牌色板、表面色板、内容色板、语义色、边框色。用表格或列表呈现。
3. **Typography**：字体栈、字号层级、字重、行高、字间距。用表格呈现。
4. **Spacing**：基础单位、间距尺度、组件内边距、区块间距。用表格呈现。
5. **Border Radius**：圆角规范及使用场景。
6. **Shadows / Elevation**：阴影层级（如使用），或明确说明不使用阴影。
7. **Components**：按钮（Primary/Secondary/Ghost/Destructive 等变体）、输入框、卡片、标签、列表、复选框、单选框、提示框等。每个组件需要详细描述背景色、文字色、边框、圆角、内边距、字体、悬停/激活状态。
8. **Do's and Don'ts** (8-10 条)：设计原则和使用禁忌，用简洁有力的语言。

## 输出要求
- 使用 Markdown 格式，层级清晰
- 颜色使用 HEX 代码（如 #0A0A0A）
- 为设计系统起一个贴切的中文或英文名称
- Overview 需要生动描述设计风格和气质
- 如果数据不足，请基于设计风格合理推断并补充，保持专业性和一致性
- 整个文档保持统一的口吻和风格
- 参考示例的格式风格，但不要完全照搬某个示例的内容`;

  const formatReference = `
【DESIGN.md 格式参考示例】

以下是两个不同风格的设计系统文档结构参考，请根据实际网页风格选择合适的表达方式：

---

示例 1 (简洁列表式)：

# [设计系统名称]

## Overview
[2-3 段设计描述]

## Colors

- **Primary** (#0A0A0A): [用途描述]
- **Secondary** (#EF4444): [用途描述]

## Typography

- **Headline Font**: Font Name
- **Body Font**: Font Name
- **Mono Font**: Font Name

- **h1**: Font Name 64px regular, 1.0 line height
- **body**: Font Name 16px regular, 1.6 line height

## Spacing

Base unit: 8px
- **sp-1**: 4px
- **sp-2**: 8px

## Border Radius

- **radius-none** (0px): All elements

## Elevation

[描述阴影策略]

## Components

### Buttons
#### Primary
[详细样式描述]
#### Secondary
[详细样式描述]

### Inputs
[详细样式描述]

### Cards
[详细样式描述]

## Do's and Don'ts

1. **Do** ...
2. **Don't** ...

---

示例 2 (表格系统化式)：

# [设计系统名称]

## Overview
[描述]

## Colors

### Brand Palette
| Token | Hex | Role |

### Surface Palette
| Token | Hex | Role |

### Semantic Colors
| Token | Hex |

## Typography

### Font Stack
| Role | Font |

### Type Scale
| Level | Font | Size | Weight | Line Height | Usage |

## Spacing
| Property | Value |

## Border Radius
| Token | Value | Usage |

## Shadows
| Level | CSS Value | Usage |

## Components
[各组件详细描述]

## Do's and Don'ts
[原则]
`;

  const dataJson = JSON.stringify(extractedData, null, 2);

  return {
    system: systemPrompt,
    user: `【网页提取数据】\n\n${dataJson}\n\n${formatReference}\n\n请基于以上提取数据，生成一份完整的、专业的 DESIGN.md 设计系统文档。根据数据特点选择最合适的呈现方式（列表式或表格式），风格要贴合被提取网页的实际气质。`
  };
}

function cleanHeader(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[^\x20-\x7E]/g, '').trim();
}

function encodeBody(obj) {
  const json = JSON.stringify(obj);
  return new TextEncoder().encode(json);
}

async function callClaude(apiKey, model, messages, temperature = 0.7, signal) {
  const key = cleanHeader(apiKey);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: encodeBody({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 8000,
      temperature,
      system: messages.system,
      messages: [
        { role: 'user', content: messages.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API 错误 (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function callOpenAI(apiKey, model, messages, temperature = 0.7, signal) {
  const key = cleanHeader(apiKey);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'Bearer ' + key
    },
    body: encodeBody({
      model: model || 'gpt-4o',
      temperature,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API 错误 (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callCustomAPI(baseUrl, apiKey, model, messages, temperature = 0.7, signal) {
  const key = cleanHeader(apiKey);
  const url = baseUrl.endsWith('/') ? baseUrl + 'chat/completions' : baseUrl + '/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'Bearer ' + key
    },
    body: encodeBody({
      model: model || 'default',
      temperature,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`自定义 API 错误 (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function downloadDesignMd(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false
  });
}

// ==================== 连通性测试 ====================

async function testConnection(config) {
  const { provider, apiKey, model, baseUrl } = config;
  const key = cleanHeader(apiKey);

  if (!key) {
    return { success: false, error: '未配置 API Key' };
  }

  const testSignal = new AbortController();
  const timeoutId = setTimeout(() => testSignal.abort(), 15000); // 15秒超时

  try {
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: testSignal.signal,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: encodeBody({
          model: model || 'claude-sonnet-4-6',
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return { success: false, error: 'API Key 无效 (401 Unauthorized)，请检查 Key 是否正确' };
      }
      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `API 返回错误 (${response.status}): ${text.slice(0, 200)}` };
      }
      return { success: true, message: 'Claude API 连接正常' };
    }

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: testSignal.signal,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': 'Bearer ' + key
        },
        body: encodeBody({
          model: model || 'gpt-4o',
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return { success: false, error: 'API Key 无效 (401 Unauthorized)，请检查 Key 是否正确' };
      }
      if (response.status === 429) {
        return { success: false, error: '请求过于频繁 (429 Rate Limited)，请稍后再试' };
      }
      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `API 返回错误 (${response.status}): ${text.slice(0, 200)}` };
      }
      return { success: true, message: 'OpenAI API 连接正常' };
    }

    if (provider === 'custom') {
      if (!baseUrl) return { success: false, error: '自定义 API 需要填写 Base URL' };
      const url = baseUrl.endsWith('/') ? baseUrl + 'chat/completions' : baseUrl + '/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        signal: testSignal.signal,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': 'Bearer ' + key
        },
        body: encodeBody({
          model: model || 'default',
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        return { success: false, error: 'API Key 无效 (401 Unauthorized)' };
      }
      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `API 返回错误 (${response.status}): ${text.slice(0, 200)}` };
      }
      return { success: true, message: '自定义 API 连接正常' };
    }

    return { success: false, error: '未知的 API 提供商' };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: '连接超时 (15秒)，请检查网络或 API 地址是否正确' };
    }
    return { success: false, error: '网络错误: ' + err.message };
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('SidePanel setup error:', error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generate') {
    handleGeneration(request.data, request.config).then(result => {
      sendResponse(result);
    }).catch(err => {
      if (err.name === 'AbortError') {
        sendResponse({ success: false, error: '已取消生成', cancelled: true });
      } else {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }

  if (request.action === 'startElementMode') {
    handleElementMode(request.tabId, request.config).then(result => {
      sendResponse(result);
    }).catch(err => {
      if (err.name === 'AbortError') {
        sendResponse({ success: false, error: '已取消生成', cancelled: true });
      } else {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }

  if (request.action === 'testConnection') {
    testConnection(request.config).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'stopGeneration') {
    if (currentController) {
      currentController.abort();
      currentController = null;
    }
    sendResponse({ success: true });
    return false;
  }
});

async function handleElementMode(tabId, config) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await new Promise(r => setTimeout(r, 400));
  } catch (e) {}

  const response = await chrome.tabs.sendMessage(tabId, { action: 'elementMode' });

  if (!response || !response.success || !response.data) {
    return { success: false, error: '提取已取消或失败' };
  }

  const result = await handleGeneration(response.data, config);

  try {
    await chrome.runtime.sendMessage({
      action: 'extractionComplete',
      ...result
    });
  } catch (e) {}

  return result;
}

async function handleGeneration(extractedData, config) {
  const prompt = buildPrompt(extractedData);

  currentController = new AbortController();
  const signal = currentController.signal;

  try {
    let designMd;
    const { provider, apiKey, model, baseUrl, temperature } = config;

    if (!apiKey) {
      throw new Error('未配置 API Key');
    }

    if (provider === 'anthropic') {
      designMd = await callClaude(apiKey, model, prompt, temperature, signal);
    } else if (provider === 'openai') {
      designMd = await callOpenAI(apiKey, model, prompt, temperature, signal);
    } else if (provider === 'custom') {
      if (!baseUrl) throw new Error('自定义 API 需要填写 Base URL');
      designMd = await callCustomAPI(baseUrl, apiKey, model, prompt, temperature, signal);
    } else {
      throw new Error('未知的 API 提供商');
    }

    designMd = designMd
      .replace(/^```markdown\n?/, '')
      .replace(/\n?```$/, '')
      .replace(/^```\n?/, '')
      .trim();

    let domain;
    try {
      domain = new URL(extractedData.pageMeta.url).hostname.replace(/^www\./, '');
    } catch {
      domain = 'design';
    }

    const nameMatch = designMd.match(/^#\s*(.+)$/m);
    let filename;
    if (nameMatch) {
      const designName = nameMatch[1].trim().replace(/[\\/:*?"<>|]/g, '-');
      filename = `${designName}-DESIGN.md`;
    } else {
      filename = `${domain}-DESIGN.md`;
    }

    await downloadDesignMd(designMd, filename);

    return { success: true, filename };
  } finally {
    currentController = null;
  }
}
