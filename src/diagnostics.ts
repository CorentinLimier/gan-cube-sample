import './diagnostics.css';

type LogLevel = 'info' | 'warn' | 'error';

interface DiagnosticEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: unknown;
}

const entries: DiagnosticEntry[] = [];
const MAX_ENTRIES = 500;

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return JSON.stringify({
        name: value.name,
        message: value.message,
        stack: value.stack
      });
    }

    return JSON.stringify(value, (_key, item) => {
      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack
        };
      }

      if (item instanceof ArrayBuffer) {
        return `[ArrayBuffer: ${item.byteLength} bytes]`;
      }

      if (ArrayBuffer.isView(item)) {
        return `[${item.constructor.name}: ${item.byteLength} bytes]`;
      }

      return item;
    });
  } catch {
    return String(value);
  }
}

function addLog(
  level: LogLevel,
  message: string,
  details?: unknown
): void {
  const entry: DiagnosticEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    details
  };

  entries.push(entry);

  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }

  renderLog(entry);
  updateCount();
}

export function diagLog(
  message: string,
  details?: unknown
): void {
  addLog('info', message, details);
}

function renderLog(entry: DiagnosticEntry): void {
  const output = document.getElementById('diagnostic-log');
  if (!output) return;

  const line = document.createElement('div');
  line.className = `diag-entry diag-${entry.level}`;

  const time = document.createElement('span');
  time.className = 'diag-time';
  time.textContent = new Date(entry.timestamp).toLocaleTimeString();

  const message = document.createElement('span');
  message.className = 'diag-message';
  message.textContent = entry.message;

  line.append(time, message);

  if (entry.details !== undefined) {
    const details = document.createElement('pre');
    details.className = 'diag-details';
    details.textContent = safeStringify(entry.details);
    line.append(details);
  }

  output.append(line);

  while (output.children.length > MAX_ENTRIES) {
    output.firstElementChild?.remove();
  }

  output.scrollTop = output.scrollHeight;
}

function environmentInfo() {
  return {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    online: navigator.onLine,
    secureContext: window.isSecureContext,
    bluetoothAvailable: 'bluetooth' in navigator,
    bluetoothGranted: 'permissions' in navigator,
    screen: {
      width: screen.width,
      height: screen.height,
      pixelRatio: window.devicePixelRatio
    }
  };
}

function exportReport() {
  return {
    application: 'GAN Cube Sample',
    reportVersion: 1,
    environment: environmentInfo(),
    logs: entries
  };
}

function downloadLogs(): void {
  const report = exportReport();
  const blob = new Blob(
    [JSON.stringify(report, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `gan-ble-diagnostics-${Date.now()}.json`;
  anchor.click();

  URL.revokeObjectURL(url);

  diagLog('DIAGNOSTIC_REPORT_DOWNLOADED');
}

async function copyLogs(): Promise<void> {
  const report = JSON.stringify(exportReport(), null, 2);

  try {
    await navigator.clipboard.writeText(report);
    diagLog('DIAGNOSTIC_REPORT_COPIED');
  } catch (error) {
    addLog('error', 'CLIPBOARD_COPY_FAILED', {
      error: String(error)
    });
  }
}

function createPanel(): void {
  const panel = document.createElement('section');
  panel.id = 'diagnostics-panel';

  panel.innerHTML = `
    <details open>
      <summary>
        <strong>Bluetooth diagnostics</strong>
        <span id="diagnostic-count">0 events</span>
      </summary>

      <div class="diag-actions">
        <button id="diag-copy" type="button">Copy logs</button>
        <button id="diag-download" type="button">Download JSON</button>
        <button id="diag-clear" type="button">Clear</button>
      </div>

      <div id="diagnostic-status">Waiting for connection...</div>
      <div id="diagnostic-log" aria-live="polite"></div>
    </details>
  `;

  document.querySelector('#app')?.append(panel);

  document.getElementById('diag-copy')?.addEventListener(
    'click',
    () => void copyLogs()
  );

  document.getElementById('diag-download')?.addEventListener(
    'click',
    downloadLogs
  );

  document.getElementById('diag-clear')?.addEventListener(
    'click',
    () => {
      entries.length = 0;
      const output = document.getElementById('diagnostic-log');
      if (output) output.innerHTML = '';
      updateCount();
    }
  );

  updateCount();
}

function updateCount(): void {
  const count = document.getElementById('diagnostic-count');
  if (count) count.textContent = `${entries.length} events`;
}

// Capture GAN library console messages without suppressing normal console output.
(['log', 'info', 'warn', 'error'] as const).forEach(method => {
  const original = console[method].bind(console);

  console[method] = (...args: unknown[]) => {
    original(...args);

    const first = String(args[0] ?? '');

    if (
      first.includes('[GAN-BLE') ||
      first.includes('[APP-BLE')
    ) {
      addLog(
        method === 'error' ? 'error' :
        method === 'warn' ? 'warn' : 'info',
        first,
        args.length > 1 ? args.slice(1) : undefined
      );
    } else if (method === 'error') {
      addLog('error', first, args.slice(1));
    }
  };
});

window.addEventListener('error', event => {
  addLog('error', 'JAVASCRIPT_ERROR', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack
  });
});

window.addEventListener('unhandledrejection', event => {
  addLog('error', 'UNHANDLED_PROMISE_REJECTION', {
    reason: safeStringify(event.reason)
  });
});

window.addEventListener('online', () => {
  diagLog('NETWORK_ONLINE');
});

window.addEventListener('offline', () => {
  addLog('warn', 'NETWORK_OFFLINE');
});

createPanel();

diagLog('DIAGNOSTICS_INITIALIZED', environmentInfo());

