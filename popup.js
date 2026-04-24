// popup.js - 用户交互界面

let currentMode = 'scan';
let isGenerating = false;

document.addEventListener('DOMContentLoaded', async () => {
  const saved = await chrome.storage.local.get(['provider', 'apiKey', 'model', 'baseUrl', 'temperature']);
  if (saved.provider) document.getElementById('provider').value = saved.provider;
  if (saved.apiKey) document.getElementById('api-key').value = saved.apiKey;
  if (saved.model) document.getElementById('model').value = saved.model;
  if (saved.baseUrl) document.getElementById('base-url').value = saved.baseUrl;
  if (saved.temperature !== undefined) document.getElementById('temperature').value = saved.temperature;

  document.getElementById('btn-scan').addEventListener('click', () => setMode('scan'));
  document.getElementById('btn-element').addEventListener('click', () => setMode('element'));
  document.getElementById('settings-toggle').addEventListener('click', toggleSettings);
  document.getElementById('btn-save').addEventListener('click', saveSettings);
  document.getElementById('btn-test').addEventListener('click', testConnection);
  document.getElementById('btn-stop').addEventListener('click', stopGeneration);
  document.getElementById('provider').addEventListener('change', onProviderChange);
  document.getElementById('btn-start').addEventListener('click', startExtraction);
  document.getElementById('btn-toggle-key').addEventListener('click', toggleApiKeyVisibility);

  ['provider', 'api-key', 'model', 'base-url', 'temperature'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', debounce(saveSettingsSilent, 500));
  });

  onProviderChange();
});

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function saveSettingsSilent() {
  const settings = {
    provider: document.getElementById('provider').value,
    apiKey: document.getElementById('api-key').value.trim(),
    model: document.getElementById('model').value.trim(),
    baseUrl: document.getElementById('base-url').value.trim(),
    temperature: parseFloat(document.getElementById('temperature').value)
  };
  await chrome.storage.local.set(settings);
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-card').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${mode}`).classList.add('active');
}

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const toggle = document.getElementById('settings-toggle');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  toggle.classList.toggle('open', isHidden);
}

function onProviderChange() {
  const provider = document.getElementById('provider').value;
  document.getElementById('custom-url-group').style.display = provider === 'custom' ? 'block' : 'none';
}

function showStatus(text, type = '') {
  const textEl = document.getElementById('status-text');
  const dotEl = document.getElementById('status-dot');
  textEl.textContent = text;
  textEl.className = 'status-text ' + type;
  dotEl.className = 'status-dot ' + type;
}

function setGenerating(generating) {
  isGenerating = generating;
  const startBtn = document.getElementById('btn-start');
  const stopBtn = document.getElementById('btn-stop');
  if (generating) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
  } else {
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    startBtn.disabled = false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractionComplete') {
    setGenerating(false);
    if (request.success) {
      showStatus(`已下载: ${request.filename}`, 'success');
    } else if (request.cancelled) {
      showStatus('已取消生成', 'warning');
    } else {
      showStatus(`错误: ${request.error}`, 'error');
    }
  }
});

async function saveSettings() {
  await saveSettingsSilent();
  showStatus('设置已保存', 'success');
}

async function testConnection() {
  const btn = document.getElementById('btn-test');
  const settings = {
    provider: document.getElementById('provider').value,
    apiKey: document.getElementById('api-key').value.trim(),
    model: document.getElementById('model').value.trim(),
    baseUrl: document.getElementById('base-url').value.trim()
  };

  if (!settings.apiKey) {
    showStatus('请先填写 API Key', 'error');
    return;
  }

  btn.disabled = true;
  showStatus('正在测试连接...', 'processing');

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'testConnection',
      config: settings
    });

    if (result.success) {
      showStatus(result.message, 'success');
    } else {
      showStatus(result.error, 'error');
    }
  } catch (err) {
    showStatus(`测试失败: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function stopGeneration() {
  try {
    await chrome.runtime.sendMessage({ action: 'stopGeneration' });
    setGenerating(false);
    showStatus('已发送停止信号', 'warning');
  } catch (err) {
    showStatus(`停止失败: ${err.message}`, 'error');
  }
}

async function getTargetTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

function isRestrictedUrl(url) {
  if (!url) return false;
  return url.startsWith('chrome://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('edge://') ||
         url.startsWith('edge-extension://') ||
         url.startsWith('about:') ||
         url.startsWith('file://');
}

async function ensureContentScript(tabId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response?.pong) return true;
    } catch (e) {
      if (i >= retries - 1) break;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        await new Promise(r => setTimeout(r, 600));
      } catch (injectErr) {
        const msg = injectErr?.message || String(injectErr);
        if (i >= retries - 2) {
          if (msg.includes('Cannot access')) {
            throw new Error('无法访问当前页面，请在普通网页上重试（chrome:// 等特殊页面不支持）');
          }
          throw new Error('脚本注入失败: ' + msg);
        }
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }
  throw new Error('内容脚本未就绪，请刷新页面后重试');
}

async function startExtraction() {
  const settings = await chrome.storage.local.get(['provider', 'apiKey', 'model', 'baseUrl', 'temperature']);

  if (!settings.apiKey) {
    showStatus('请先配置 API Key', 'error');
    toggleSettings();
    document.getElementById('api-key').focus();
    return;
  }

  setGenerating(true);

  try {
    const tab = await getTargetTab();

    if (!tab || !tab.id) {
      showStatus('无法获取当前浏览的标签页', 'error');
      setGenerating(false);
      return;
    }

    if (isRestrictedUrl(tab.url)) {
      showStatus(`当前页面 (${tab.url}) 不允许注入脚本，请打开一个普通网页`, 'error');
      setGenerating(false);
      return;
    }

    await ensureContentScript(tab.id);

    if (currentMode === 'scan') {
      showStatus('正在扫描页面样式...', 'processing');

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });
      if (!response || !response.success) {
        throw new Error(response?.error || '扫描失败，请刷新页面后重试');
      }

      showStatus('正在调用 LLM 生成 DESIGN.md...', 'processing');
      const result = await chrome.runtime.sendMessage({
        action: 'generate',
        data: response.data,
        config: {
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          baseUrl: settings.baseUrl,
          temperature: settings.temperature ?? 0.7
        }
      });

      setGenerating(false);
      if (result.success) {
        showStatus(`已下载: ${result.filename}`, 'success');
      } else if (result.cancelled) {
        showStatus('已取消生成', 'warning');
      } else {
        throw new Error(result.error);
      }
    } else {
      showStatus('请在页面中点击要提取的元素...', 'processing');

      try {
        await chrome.runtime.sendMessage({
          action: 'startElementMode',
          tabId: tab.id,
          config: {
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model,
            baseUrl: settings.baseUrl,
            temperature: settings.temperature ?? 0.7
          }
        });
      } catch (err) {
        setGenerating(false);
        showStatus(`错误: ${err.message}`, 'error');
      }
    }
  } catch (err) {
    setGenerating(false);
    showStatus(`错误: ${err.message}`, 'error');
  }
}
