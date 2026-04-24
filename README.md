<div align="center">

<h1>Design Extractor</h1>

<p>A Chrome extension that extracts visual design systems from any webpage and generates <code>DESIGN.md</code> documents via LLM.</p>

<p>
  <b>English</b> | <a href="README.zh-CN.md">中文</a>
</p>

<img src="https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome" alt="Chrome Extension">
<img src="https://img.shields.io/badge/Manifest-V3-green" alt="Manifest V3">
<img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License">

</div>

---

## Overview

**Design Extractor** is a Chrome side-panel extension that automatically analyzes a webpage's visual design elements — colors, typography, spacing, shadows, border radius, and component styles — then uses an LLM API to generate a professional `DESIGN.md` design system document.

The generated `DESIGN.md` follows the [Google Stitch](https://stitch.withgoogle.com/) single-file design system format, serving as a bridge between design intent and AI-generated code.

## Features

- **Full-page Scan Mode**: Automatically samples visible DOM elements and aggregates design tokens by frequency.
- **Element Click Mode**: Click any element on the page to extract its specific computed styles and nearby similar elements.
- **LLM-Powered Generation**: Supports Anthropic Claude, OpenAI GPT, and custom API endpoints.
- **One-Click Download**: Generated `DESIGN.md` is downloaded directly via the browser.
- **Dark UI**: Side-panel interface inspired by Figma / Adobe Creative Cloud design tools.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extension folder.
5. Click the extension icon in the toolbar to open the side panel.

## Usage

1. Open any regular webpage (not `chrome://`, `file://`, etc.).
2. Click the extension icon to open the side panel.
3. Configure your LLM API key in the **API Config** section:
   - Choose provider: Anthropic Claude / OpenAI GPT / Custom API
   - Enter your API key
   - (Optional) Adjust model name and temperature
4. Select extraction mode:
   - **Scan** — Scan the entire page
   - **Element** — Click a specific element
5. Click **Start Extraction** and wait for the LLM to generate and download `DESIGN.md`.

## Tech Stack

- Chrome Extension Manifest V3
- Side Panel API
- Content Script injection (`scripting` API)
- Service Worker background script
- Vanilla JavaScript (no build step required)

## File Structure

```
├── manifest.json       # Extension manifest
├── popup.html          # Side panel UI
├── popup.css           # Dark-themed styles
├── popup.js            # UI interactions
├── content.js          # DOM extraction engine
├── background.js       # LLM API calls & file download
├── icons/              # Extension icons
├── README.md           # This file
├── README.zh-CN.md     # Chinese version
└── LICENSE             # MIT License
```

---

<div align="center">

Made with 💜 for designers and developers.

</div>
