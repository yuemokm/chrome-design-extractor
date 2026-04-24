// content.js - 网页视觉设计元素提取引擎（增强版）

const DesignExtractor = {
  // ==================== 颜色工具 ====================

  toHex(color) {
    if (!color || color === 'transparent' || color === 'inherit' || color === 'initial') return null;
    color = color.trim().toLowerCase();

    // 已规范化 hex
    if (color.startsWith('#')) {
      if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      return color.toUpperCase();
    }

    // rgb / rgba
    const rgbMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (rgbMatch) {
      const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
      if (a < 0.1) return null;
      const r = parseInt(rgbMatch[1]), g = parseInt(rgbMatch[2]), b = parseInt(rgbMatch[3]);
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    // hsl / hsla
    const hslMatch = color.match(/^hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\)$/);
    if (hslMatch) {
      const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
      if (a < 0.1) return null;
      const h = parseInt(hslMatch[1]), s = parseFloat(hslMatch[2]), l = parseFloat(hslMatch[3]);
      const rgb = this.hslToRgb(h, s, l);
      return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    return null;
  },

  hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  },

  // ==================== DOM 遍历（含 Shadow DOM）====================

  *walkElements(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let el;
    while ((el = walker.nextNode())) {
      yield el;
      if (el.shadowRoot) {
        yield* this.walkElements(el.shadowRoot);
      }
    }
  },

  getAllElements() {
    const elements = [];
    for (const el of this.walkElements(document.documentElement)) {
      elements.push(el);
    }
    return elements;
  },

  isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 &&
           style.visibility !== 'hidden' &&
           style.display !== 'none' &&
           rect.top < window.innerHeight &&
           rect.bottom > 0;
  },

  // ==================== 统计工具 ====================

  frequencyCount(arr) {
    const map = {};
    arr.forEach(v => { if (v) map[v] = (map[v] || 0) + 1; });
    return Object.entries(map)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  },

  // ==================== 颜色提取与分类 ====================

  classifyColor(hex, usage) {
    // 将颜色按用途智能分类
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    if (usage === 'text') {
      if (luminance < 0.3) return 'dark';
      if (luminance > 0.7) return 'light';
      return 'muted';
    }
    if (usage === 'background') {
      if (luminance > 0.95) return 'surface';
      if (luminance < 0.1) return 'surfaceInverted';
      return 'surfaceTinted';
    }
    return 'accent';
  },

  extractColors(sampleSize = 600) {
    const allElements = this.getAllElements();
    const visibleElements = allElements.filter(el => this.isVisible(el)).slice(0, sampleSize);

    const backgrounds = [];
    const texts = [];
    const borders = [];
    const fills = []; // 非背景色的填充色

    visibleElements.forEach(el => {
      const style = getComputedStyle(el);
      const bg = this.toHex(style.backgroundColor);
      const color = this.toHex(style.color);
      const border = this.toHex(style.borderTopColor);
      const fill = this.toHex(style.fill);

      if (bg) backgrounds.push(bg);
      if (color) texts.push(color);
      if (border && border !== bg) borders.push(border);
      if (fill) fills.push(fill);
    });

    // CSS 变量中的颜色
    const cssVarColors = [];
    try {
      const rootStyles = getComputedStyle(document.documentElement);
      for (let i = 0; i < rootStyles.length; i++) {
        const prop = rootStyles[i];
        if (prop.startsWith('--')) {
          const val = rootStyles.getPropertyValue(prop).trim();
          const hex = this.toHex(val);
          if (hex) cssVarColors.push({ name: prop, value: hex });
        }
      }
    } catch (e) {}

    // 从 styleSheets 收集更多颜色
    const sheetColors = [];
    try {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules || []) {
          if (rule.style) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.includes('color') || prop.includes('background') || prop.includes('border') || prop.includes('fill')) {
                const val = rule.style.getPropertyValue(prop).trim();
                const hex = this.toHex(val);
                if (hex) sheetColors.push(hex);
              }
            }
          }
          // 尝试提取 :hover 规则中的颜色
          if (rule.selectorText && rule.selectorText.includes(':hover') && rule.style) {
            const hoverColor = this.toHex(rule.style.color) || this.toHex(rule.style.backgroundColor);
            if (hoverColor) sheetColors.push(hoverColor + ' (hover)');
          }
        }
      }
    } catch (e) {}

    // 获取页面主要背景色（body/html）
    const bodyBg = this.toHex(getComputedStyle(document.body).backgroundColor);
    const htmlBg = this.toHex(getComputedStyle(document.documentElement).backgroundColor);

    const allBg = this.frequencyCount(backgrounds);
    const allText = this.frequencyCount(texts);
    const allBorder = this.frequencyCount(borders);
    const allColors = this.frequencyCount([...backgrounds, ...texts, ...borders, ...fills, ...sheetColors]);

    return {
      pageBackground: bodyBg || htmlBg || '#FFFFFF',
      backgrounds: allBg.slice(0, 20),
      texts: allText.slice(0, 15),
      borders: allBorder.slice(0, 15),
      cssVariables: cssVarColors.slice(0, 20),
      all: allColors.slice(0, 30),
      palette: {
        primary: allColors[0]?.value || '#000000',
        secondary: allColors[1]?.value || null,
        accent: allColors.find(c => c.value !== allColors[0]?.value)?.value || null,
        background: bodyBg || '#FFFFFF',
        text: allText[0]?.value || '#000000'
      }
    };
  },

  // ==================== 字体提取 ====================

  extractTypography(sampleSize = 600) {
    const allElements = this.getAllElements();
    const visibleElements = allElements.filter(el => this.isVisible(el)).slice(0, sampleSize);

    const families = new Set();
    const sizes = [];
    const weights = [];
    const lineHeights = [];
    const letterSpacings = [];
    const textTransforms = [];

    visibleElements.forEach(el => {
      const style = getComputedStyle(el);
      const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (family && family !== 'inherit' && family !== 'initial' && !family.startsWith('system-')) {
        families.add(family);
      }
      if (style.fontSize && style.fontSize !== '0px') sizes.push(style.fontSize);
      if (style.fontWeight && style.fontWeight !== '400' && style.fontWeight !== 'normal') weights.push(style.fontWeight);
      if (style.lineHeight && style.lineHeight !== 'normal') lineHeights.push(style.lineHeight);
      if (style.letterSpacing && style.letterSpacing !== 'normal') letterSpacings.push(style.letterSpacing);
      if (style.textTransform && style.textTransform !== 'none') textTransforms.push(style.textTransform);
    });

    return {
      families: Array.from(families).slice(0, 12),
      sizes: this.frequencyCount(sizes).slice(0, 15),
      weights: [...new Set(weights)].slice(0, 10),
      lineHeights: [...new Set(lineHeights)].slice(0, 10),
      letterSpacings: [...new Set(letterSpacings)].slice(0, 8),
      textTransforms: [...new Set(textTransforms)]
    };
  },

  // ==================== 间距提取 ====================

  extractSpacing(sampleSize = 600) {
    const allElements = this.getAllElements();
    const visibleElements = allElements.filter(el => this.isVisible(el)).slice(0, sampleSize);

    const paddings = [];
    const margins = [];
    const gaps = [];

    visibleElements.forEach(el => {
      const style = getComputedStyle(el);
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(p => {
        if (style[p] && style[p] !== '0px') paddings.push(style[p]);
      });
      ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].forEach(m => {
        if (style[m] && style[m] !== '0px') margins.push(style[m]);
      });
      if (style.gap && style.gap !== 'normal' && style.gap !== '0px') gaps.push(style.gap);
      if (style.rowGap && style.rowGap !== 'normal' && style.rowGap !== '0px') gaps.push(style.rowGap);
      if (style.columnGap && style.columnGap !== 'normal' && style.columnGap !== '0px') gaps.push(style.columnGap);
    });

    // 推断基础单位：找最小公约数
    const allSpacing = [...paddings, ...margins, ...gaps];
    const numericValues = allSpacing
      .map(v => parseInt(v))
      .filter(v => v > 0 && v <= 200);
    const baseUnit = numericValues.length > 0
      ? this.findBaseUnit(numericValues)
      : 8;

    return {
      baseUnit: baseUnit + 'px',
      paddings: this.frequencyCount(paddings).slice(0, 12),
      margins: this.frequencyCount(margins).slice(0, 12),
      gaps: this.frequencyCount(gaps).slice(0, 10)
    };
  },

  findBaseUnit(values) {
    // 找出现频率最高的最小值（通常 4, 8, 16）
    const counts = {};
    values.forEach(v => {
      [1, 2, 4, 5, 8, 10, 12, 16].forEach(base => {
        if (v % base === 0) counts[base] = (counts[base] || 0) + 1;
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? parseInt(sorted[0][0]) : 8;
  },

  // ==================== 圆角提取 ====================

  extractBorderRadius(sampleSize = 600) {
    const allElements = this.getAllElements();
    const visibleElements = allElements.filter(el => this.isVisible(el)).slice(0, sampleSize);

    const radii = [];
    visibleElements.forEach(el => {
      const style = getComputedStyle(el);
      if (style.borderRadius && style.borderRadius !== '0px') {
        radii.push(style.borderRadius);
      }
    });

    return this.frequencyCount(radii).slice(0, 15);
  },

  // ==================== 阴影提取 ====================

  extractShadows(sampleSize = 600) {
    const allElements = this.getAllElements();
    const visibleElements = allElements.filter(el => this.isVisible(el)).slice(0, sampleSize);

    const shadows = [];
    visibleElements.forEach(el => {
      const style = getComputedStyle(el);
      if (style.boxShadow && style.boxShadow !== 'none') {
        shadows.push(style.boxShadow);
      }
    });

    // 检查是否有 outline/focus ring 样式
    const focusRings = [];
    try {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText && rule.selectorText.includes(':focus') && rule.style) {
            const outline = rule.style.outline || rule.style.boxShadow;
            if (outline && outline !== 'none') focusRings.push(outline);
          }
        }
      }
    } catch (e) {}

    const counted = this.frequencyCount(shadows);
    return {
      shadows: counted.slice(0, 10),
      focusRings: focusRings.slice(0, 5)
    };
  },

  // ==================== 过渡与动画 ====================

  extractTransitions() {
    const transitions = new Set();
    const durations = new Set();
    const easings = new Set();

    try {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules || []) {
          if (rule.style) {
            const t = rule.style.transition;
            const d = rule.style.transitionDuration;
            const e = rule.style.transitionTimingFunction;
            if (t && t !== 'all 0s ease 0s') transitions.add(t);
            if (d && d !== '0s') durations.add(d);
            if (e && e !== 'ease') easings.add(e);
          }
        }
      }
    } catch (e) {}

    return {
      transitions: Array.from(transitions).slice(0, 10),
      durations: Array.from(durations).slice(0, 8),
      easings: Array.from(easings).slice(0, 8)
    };
  },

  // ==================== 组件提取 ====================

  getStylesSnapshot(el) {
    const style = getComputedStyle(el);
    return {
      backgroundColor: this.toHex(style.backgroundColor) || 'transparent',
      color: this.toHex(style.color) || '#000000',
      border: style.borderWidth !== '0px'
        ? `${style.borderWidth} ${style.borderStyle} ${this.toHex(style.borderColor) || 'transparent'}`
        : 'none',
      borderRadius: style.borderRadius,
      padding: style.padding,
      margin: style.margin,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
      boxShadow: style.boxShadow !== 'none' ? style.boxShadow : 'none',
      width: style.width,
      height: style.height,
      display: style.display,
      gap: style.gap !== 'normal' ? style.gap : undefined
    };
  },

  extractComponents() {
    const buttons = [];
    const inputs = [];
    const cards = [];
    const links = [];
    const badges = [];

    const allElements = this.getAllElements();

    // 按钮
    const buttonSelectors = 'button, [role="button"], input[type="submit"], input[type="button"], .btn, [class*="button"], [class*="Button"]'
      .split(', ');
    const buttonEls = [];
    buttonSelectors.forEach(sel => {
      try {
        allElements.filter(el => el.matches && el.matches(sel)).forEach(el => {
          if (!buttonEls.includes(el)) buttonEls.push(el);
        });
      } catch (e) {}
    });
    buttonEls.filter(el => this.isVisible(el)).slice(0, 15).forEach(el => {
      buttons.push({
        text: el.textContent?.trim()?.substring(0, 50) || el.value || 'Button',
        styles: this.getStylesSnapshot(el)
      });
    });

    // 输入框
    allElements.filter(el =>
      el.matches && (
        el.matches('input:not([type="submit"]):not([type="button"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])') ||
        el.matches('textarea') ||
        el.matches('select')
      )
    ).filter(el => this.isVisible(el)).slice(0, 15).forEach(el => {
      inputs.push({
        type: el.tagName.toLowerCase(),
        inputType: el.type || 'text',
        styles: this.getStylesSnapshot(el)
      });
    });

    // 卡片
    const cardEls = [];
    ['.card', '[class*="card"]', '[class*="Card"]', '[class*="panel"]', '[class*="Panel"]'].forEach(sel => {
      try {
        allElements.filter(el => el.matches && el.matches(sel)).forEach(el => {
          if (!cardEls.includes(el)) cardEls.push(el);
        });
      } catch (e) {}
    });

    // 兜底：找有背景色+边框/padding 的 div
    if (cardEls.length === 0) {
      allElements.filter(el => el.tagName === 'DIV').filter(el => this.isVisible(el)).slice(0, 100).forEach(el => {
        const style = getComputedStyle(el);
        const hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        const hasBorder = style.borderWidth !== '0px';
        const hasPadding = style.paddingTop !== '0px';
        if (hasBg && (hasBorder || hasPadding) && !cardEls.includes(el)) {
          cardEls.push(el);
        }
      });
    }

    cardEls.slice(0, 12).forEach(el => {
      cards.push({ styles: this.getStylesSnapshot(el) });
    });

    // 链接
    allElements.filter(el => el.tagName === 'A').filter(el => this.isVisible(el)).slice(0, 10).forEach(el => {
      links.push({
        text: el.textContent?.trim()?.substring(0, 50) || 'Link',
        styles: this.getStylesSnapshot(el)
      });
    });

    // 标签/徽章
    allElements.filter(el =>
      el.matches && (
        el.matches('.badge, [class*="badge"], [class*="Badge"], [class*="tag"], [class*="Tag"], [class*="chip"], [class*="Chip"]')
      )
    ).filter(el => this.isVisible(el)).slice(0, 10).forEach(el => {
      badges.push({
        text: el.textContent?.trim()?.substring(0, 30) || '',
        styles: this.getStylesSnapshot(el)
      });
    });

    return { buttons: buttons.slice(0, 10), inputs: inputs.slice(0, 10), cards: cards.slice(0, 10), links: links.slice(0, 8), badges };
  },

  // ==================== 主扫描入口 ====================

  scanPage() {
    return {
      pageMeta: {
        title: document.title,
        url: location.href,
        mode: 'scan',
        viewport: { width: window.innerWidth, height: window.innerHeight }
      },
      colors: this.extractColors(),
      typography: this.extractTypography(),
      spacing: this.extractSpacing(),
      borderRadius: this.extractBorderRadius(),
      shadows: this.extractShadows(),
      transitions: this.extractTransitions(),
      components: this.extractComponents()
    };
  },

  // ==================== 元素点击模式 ====================

  activateElementMode() {
    return new Promise((resolve) => {
      const styleEl = document.createElement('style');
      styleEl.id = 'design-extractor-highlight-style';
      styleEl.textContent = `
        .design-extractor-highlight {
          outline: 3px solid #4F46E5 !important;
          outline-offset: 2px !important;
          cursor: crosshair !important;
          position: relative;
          z-index: 999998 !important;
        }
        .design-extractor-overlay {
          position: fixed;
          top: 16px;
          right: 16px;
          background: #1F2937;
          color: white;
          padding: 14px 18px;
          border-radius: 10px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          z-index: 999999;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          max-width: 300px;
          line-height: 1.5;
        }
        .design-extractor-overlay h3 { margin: 0 0 8px 0; font-size: 15px; }
        .design-extractor-overlay p { margin: 0 0 12px 0; font-size: 13px; opacity: 0.85; }
        .design-extractor-overlay .buttons { display: flex; gap: 8px; flex-wrap: wrap; }
        .design-extractor-overlay button {
          padding: 6px 14px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        }
        .design-extractor-confirm { background: #4F46E5; color: white; }
        .design-extractor-confirm:hover { background: #4338CA; }
        .design-extractor-retry { background: #374151; color: #D1D5DB; }
        .design-extractor-retry:hover { background: #4B5563; }
        .design-extractor-cancel { background: #DC2626; color: white; }
        .design-extractor-cancel:hover { background: #B91C1C; }
      `;
      document.head.appendChild(styleEl);

      const overlay = document.createElement('div');
      overlay.className = 'design-extractor-overlay';
      overlay.innerHTML = `
        <h3>&#127912; 点击提取模式</h3>
        <p>将鼠标悬停在元素上预览高亮，点击选中要提取的设计元素</p>
        <div class="buttons"><button class="design-extractor-cancel">取消</button></div>
      `;
      document.body.appendChild(overlay);

      let lastHighlighted = null;
      let isProcessing = false;

      const highlight = (el) => {
        if (lastHighlighted) lastHighlighted.classList.remove('design-extractor-highlight');
        el.classList.add('design-extractor-highlight');
        lastHighlighted = el;
      };

      const onMouseOver = (e) => {
        if (isProcessing) return;
        e.stopPropagation();
        highlight(e.target);
      };

      const cleanup = () => {
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('click', onClick, true);
        if (lastHighlighted) lastHighlighted.classList.remove('design-extractor-highlight');
        styleEl.remove();
        overlay.remove();
      };

      const onClick = (e) => {
        if (isProcessing) return;
        e.preventDefault();
        e.stopPropagation();
        isProcessing = true;
        const selected = e.target;
        highlight(selected);

        const tag = selected.tagName.toLowerCase();
        const getData = (el) => ({
          tag: el.tagName?.toLowerCase() || 'unknown',
          className: el.className,
          id: el.id,
          text: el.textContent?.trim()?.substring(0, 200) || '',
          styles: this.getStylesSnapshot(el)
        });

        const data = [getData(selected)];
        let similarSelector = tag;
        if (selected.className && typeof selected.className === 'string') {
          const c = selected.className.split(' ').filter(x => x.trim())[0];
          if (c) similarSelector = tag + '.' + c;
        }
        try {
          Array.from(document.querySelectorAll(similarSelector))
            .filter(el => el !== selected && this.isVisible(el))
            .slice(0, 3).forEach(el => data.push(getData(el)));
        } catch (e) {}

        // 子元素
        const children = [];
        selected.querySelectorAll(':scope > *').forEach((child, i) => {
          if (i >= 8) return;
          children.push(getData(child));
        });

        // 显示确认面板
        overlay.innerHTML = `
          <h3>&#9989; 已选中 &lt;${tag}&gt;</h3>
          <p>${selected.textContent?.trim()?.substring(0, 80) || '无文本内容'}${selected.textContent?.trim()?.length > 80 ? '...' : ''}</p>
          <div class="buttons">
            <button class="design-extractor-confirm">确认提取</button>
            <button class="design-extractor-retry">重新选择</button>
            <button class="design-extractor-cancel">取消</button>
          </div>
        `;

        overlay.querySelector('.design-extractor-confirm').onclick = () => {
          cleanup();
          resolve({
            pageMeta: { title: document.title, url: location.href, mode: 'element' },
            element: { tag, className: selected.className, data, children }
          });
        };

        overlay.querySelector('.design-extractor-retry').onclick = () => {
          isProcessing = false;
          overlay.innerHTML = `
            <h3>&#127912; 点击提取模式</h3>
            <p>将鼠标悬停在元素上预览高亮，点击选中要提取的设计元素</p>
            <div class="buttons"><button class="design-extractor-cancel">取消</button></div>
          `;
          overlay.querySelector('.design-extractor-cancel').onclick = () => { cleanup(); resolve(null); };
        };

        overlay.querySelector('.design-extractor-cancel').onclick = () => { cleanup(); resolve(null); };
      };

      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onClick, true);
      overlay.querySelector('.design-extractor-cancel').onclick = () => { cleanup(); resolve(null); };
    });
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return false;
  }
  if (request.action === 'scan') {
    try {
      const data = DesignExtractor.scanPage();
      sendResponse({ success: true, data });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  } else if (request.action === 'elementMode') {
    DesignExtractor.activateElementMode().then(data => {
      sendResponse({ success: !!data, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  return false;
});
