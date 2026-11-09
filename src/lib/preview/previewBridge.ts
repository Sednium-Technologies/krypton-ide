import htmlToImageSource from 'html-to-image/dist/html-to-image.js?raw';

export const PREVIEW_IFRAME_ID = 'live-preview-iframe';
export const PREVIEW_HOST_SOURCE = 'krypton-host';
export const PREVIEW_BRIDGE_SOURCE = 'krypton-preview';
export const PREVIEW_MESSAGE_TYPE = 'krypton:preview';

const BRIDGE_MARKER = 'data-krypton-preview-bridge';

export interface PreviewBridgeResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Builds the inline script injected into every preview document. The script is
 * intentionally self-contained: the preview iframe may be sandboxed without
 * `allow-same-origin`, so the parent cannot reach into its DOM directly.
 */
export function buildPreviewBridgeScript(): string {
  // Source can contain the literal `</script` inside strings; escape it so the
  // inline script cannot be terminated early.
  const library = htmlToImageSource.replace(/<\/script/gi, '<\\/script');

  return `<script ${BRIDGE_MARKER}>
(function () {
  var MAX_DIMENSION = 8192;
  var MAX_PIXELS = 24000000;

  function clampDimension(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.min(MAX_DIMENSION, Math.round(n)));
  }

  function respond(id, ok, payload) {
    try {
      parent.postMessage({
        source: '${PREVIEW_BRIDGE_SOURCE}',
        type: '${PREVIEW_MESSAGE_TYPE}',
        id: id,
        ok: ok,
        data: ok ? (payload && payload.data) : undefined,
        error: ok ? undefined : (payload && payload.error) || 'Preview bridge error'
      }, '*');
    } catch (error) {
      // Nothing else can be done if postMessage itself fails.
    }
  }

  function describeNode(el, depth, budget) {
    budget.count += 1;
    var rect = el.getBoundingClientRect();
    var tag = el.tagName ? el.tagName.toLowerCase() : 'node';
    var id = el.id || undefined;
    var className = typeof el.className === 'string' ? el.className : '';
    var classes = className ? className.split(/\\s+/).filter(Boolean) : undefined;
    var role = el.getAttribute ? (el.getAttribute('role') || undefined) : undefined;

    var text = '';
    if (el.childNodes) {
      for (var i = 0; i < el.childNodes.length; i += 1) {
        var child = el.childNodes[i];
        if (child.nodeType === 3 && child.textContent && child.textContent.trim()) {
          text += (text ? ' ' : '') + child.textContent.trim();
        }
      }
    }

    var attributes = {};
    if (el.getAttribute) {
      ['href', 'src', 'type', 'value', 'placeholder', 'disabled', 'aria-label', 'name', 'alt', 'title'].forEach(function (name) {
        var value = el.getAttribute(name);
        if (value !== null) attributes[name] = value;
      });
    }

    var children = [];
    if (depth > 1 && el.children && budget.count < budget.max) {
      for (var j = 0; j < el.children.length; j += 1) {
        var childTag = el.children[j].tagName ? el.children[j].tagName.toLowerCase() : '';
        if (['script', 'style', 'noscript'].indexOf(childTag) !== -1) continue;
        if (budget.count >= budget.max) break;
        children.push(describeNode(el.children[j], depth - 1, budget));
      }
    }

    return {
      tag: tag,
      id: id,
      classes: classes && classes.length ? classes : undefined,
      role: role,
      text: text ? text.slice(0, 160) : undefined,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      attributes: Object.keys(attributes).length ? attributes : undefined,
      children: children.length ? children : undefined
    };
  }

  function inspect(selector, depth) {
    var root = selector ? document.querySelector(selector) : (document.body || document.documentElement);
    if (!root) throw new Error('Selector not found in preview: ' + selector);
    var maxDepth = Math.max(1, Math.min(12, Number(depth) || 3));
    var budget = { count: 0, max: 2500 };
    return {
      target: selector || 'preview-root',
      snapshot: describeNode(root, maxDepth, budget),
      totalElements: budget.count
    };
  }

  function cropCanvas(source, clip) {
    if (!clip) return source;
    var x = Math.max(0, Math.floor(Number(clip.x) || 0));
    var y = Math.max(0, Math.floor(Number(clip.y) || 0));
    var width = clampDimension(clip.width, source.width);
    var height = clampDimension(clip.height, source.height);
    width = Math.min(width, source.width - x);
    height = Math.min(height, source.height - y);
    if (width <= 0 || height <= 0) throw new Error('Screenshot clip is outside the captured area');

    var output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    output.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
    return output;
  }

  async function capture(options) {
    options = options || {};
    var selector = options.selector;
    var target = selector ? document.querySelector(selector) : null;
    if (selector && !target) throw new Error('Selector not found in preview: ' + selector);
    if (!target) target = document.documentElement;

    var rect = target.getBoundingClientRect();
    // A clip is applied after rendering the whole target, otherwise the crop
    // origin would be lost. Element captures use the element's own size;
    // document captures use the full scrollable page.
    var width = clampDimension(selector ? rect.width : document.documentElement.scrollWidth, 1);
    var height = clampDimension(selector ? rect.height : document.documentElement.scrollHeight, 1);
    if (width * height > MAX_PIXELS) {
      throw new Error('Screenshot area is too large (' + width + 'x' + height + ')');
    }

    var canvas = await window.htmlToImage.toCanvas(target, {
      width: width,
      height: height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      skipFonts: false,
      cacheBust: true
    });

    if (options.clip) {
      canvas = cropCanvas(canvas, options.clip);
    }

    return {
      mimeType: 'image/png',
      base64: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      selector: options.selector,
      clip: options.clip,
      target: options.selector ? 'Element: ' + options.selector : (options.fullPage ? 'Full scrollable preview' : 'Preview viewport')
    };
  }

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.source !== '${PREVIEW_HOST_SOURCE}' || message.type !== '${PREVIEW_MESSAGE_TYPE}') return;

    var id = message.id;
    try {
      if (message.action === 'inspect') {
        respond(id, true, { data: inspect(message.selector, message.depth) });
        return;
      }
      if (message.action === 'capture') {
        capture(message.options || {}).then(function (data) {
          respond(id, true, { data: data });
        }).catch(function (error) {
          respond(id, false, { error: error && error.message ? error.message : String(error) });
        });
        return;
      }
      respond(id, false, { error: 'Unknown preview bridge action: ' + message.action });
    } catch (error) {
      respond(id, false, { error: error && error.message ? error.message : String(error) });
    }
  });
})();
</script>${library}`;
}

/**
 * Appends the bridge to generated preview HTML. Kept idempotent so callers can
 * safely run it on already-instrumented documents.
 */
export function injectPreviewBridge(html: string | null): string | null {
  if (!html) return html;
  if (html.includes(BRIDGE_MARKER)) return html;
  const script = buildPreviewBridgeScript();
  const bodyClose = html.search(/<\/body\s*>/i);
  if (bodyClose !== -1) {
    return `${html.slice(0, bodyClose)}${script}\n${html.slice(bodyClose)}`;
  }
  const htmlClose = html.search(/<\/html\s*>/i);
  if (htmlClose !== -1) {
    return `${html.slice(0, htmlClose)}${script}\n${html.slice(htmlClose)}`;
  }
  return `${html}\n${script}`;
}

let requestCounter = 0;

/**
 * Sends a request to the active preview iframe and waits for its response.
 * Throws a descriptive error when no preview is open or the bridge is blocked.
 */
export async function requestPreviewBridge<T = any>(
  action: 'inspect' | 'capture',
  payload: Record<string, any> = {},
  timeoutMs: number = 20000
): Promise<T> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('Live Preview is not available in this environment');
  }

  const iframe = document.getElementById(PREVIEW_IFRAME_ID) as HTMLIFrameElement | null;
  const targetWindow = iframe?.contentWindow;
  if (!iframe || !targetWindow) {
    throw new Error('Live Preview is not open. Open the preview first, then retry.');
  }

  const id = `preview-${Date.now().toString(36)}-${(requestCounter += 1)}`;

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== targetWindow) return;
      const message = event.data;
      if (!message || message.source !== PREVIEW_BRIDGE_SOURCE || message.type !== PREVIEW_MESSAGE_TYPE) return;
      if (message.id !== id || settled) return;

      settled = true;
      cleanup();

      if (!message.ok) {
        reject(new Error(message.error || 'Preview bridge rejected the request'));
        return;
      }
      resolve(message.data as T);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Preview bridge timed out after ${timeoutMs}ms. The preview may still be loading or its content blocked the bridge script.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    targetWindow.postMessage(
      {
        source: PREVIEW_HOST_SOURCE,
        type: PREVIEW_MESSAGE_TYPE,
        id,
        action,
        ...payload,
      },
      '*'
    );
  });
}
