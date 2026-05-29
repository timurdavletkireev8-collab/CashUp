export default {
  async fetch(request, env, ctx) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Giga Test</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body {
      background: #060610;
      color: white;
      font-family: system-ui;
      padding: 20px;
    }
    button {
      background: #00b4ff;
      border: none;
      padding: 16px;
      border-radius: 12px;
      color: white;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      width: 100%;
      margin-top: 10px;
    }
    .log {
      background: #1a1a2e;
      padding: 12px;
      border-radius: 8px;
      margin-top: 20px;
      font-size: 12px;
      font-family: monospace;
      max-height: 400px;
      overflow-y: auto;
    }
    .success { color: #00e5b4; }
    .error { color: #ff5f7e; }
  </style>
</head>
<body>
<div>
  <h3>Giga.pub - альтернативные методы</h3>
  <button id="method1">Метод 1: OfferWallSDKLoader</button>
  <button id="method2">Метод 2: Прямой вызов</button>
  <button id="method3">Метод 3: window.Giga</button>
  <div class="log" id="log"></div>
</div>

<script>
const tg = window.Telegram.WebApp;
tg.expand();

const logDiv = document.getElementById('log');

function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  logDiv.innerHTML += \`<div class="\${type}">[\${time}] \${msg}</div>\`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

// Загружаем SDK
const script = document.createElement('script');
script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
script.onload = () => addLog('✅ SDK загружен', 'success');
document.head.appendChild(script);

// Метод 1: OfferWallSDKLoader
document.getElementById('method1').onclick = function() {
  addLog('Пробуем OfferWallSDKLoader...');
  if (window.OfferWallSDKLoader) {
    addLog('OfferWallSDKLoader найден, тип: ' + typeof window.OfferWallSDKLoader);
    try {
      const result = window.OfferWallSDKLoader.init({ projectId: 6822 });
      addLog('init результат: ' + JSON.stringify(result));
    } catch(e) {
      addLog('Ошибка: ' + e.message, 'error');
    }
  } else {
    addLog('OfferWallSDKLoader не найден', 'error');
  }
};

// Метод 2: Прямой вызов через data-атрибуты
document.getElementById('method2').onclick = function() {
  addLog('Пробуем прямой вызов через DOM...');
  
  // Создаем div для виджета
  const widgetDiv = document.createElement('div');
  widgetDiv.setAttribute('data-giga-widget', 'offerwall');
  widgetDiv.setAttribute('data-project-id', '6822');
  widgetDiv.style.width = '100%';
  widgetDiv.style.height = '500px';
  widgetDiv.style.position = 'fixed';
  widgetDiv.style.top = '0';
  widgetDiv.style.left = '0';
  widgetDiv.style.zIndex = '1000';
  widgetDiv.style.background = '#060610';
  
  document.body.appendChild(widgetDiv);
  addLog('Виджет добавлен, ждем...');
};

// Метод 3: Проверяем window.Giga
document.getElementById('method3').onclick = function() {
  addLog('Ищем Giga...');
  
  // Смотрим все глобальные объекты
  for (let key in window) {
    if (key.toLowerCase().includes('giga')) {
      addLog('Найден: window.' + key + ' = ' + typeof window[key]);
      if (typeof window[key] === 'function') {
        try {
          const result = window[key]();
          addLog('Результат вызова: ' + typeof result);
        } catch(e) {}
      }
    }
  }
  
  // Пробуем loadGigaSDKCallbacks
  if (window.loadGigaSDKCallbacks) {
    addLog('loadGigaSDKCallbacks найден');
    addLog('Содержимое: ' + JSON.stringify(window.loadGigaSDKCallbacks));
  }
};
</script>
</body>
</html>`;

    return new Response(html, { 
      headers: { "content-type": "text/html;charset=UTF-8" } 
    });
  }
};
