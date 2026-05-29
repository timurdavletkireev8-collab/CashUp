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
      margin: 0;
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
      white-space: pre-wrap;
      max-height: 400px;
      overflow-y: auto;
    }
    .success { color: #00e5b4; }
    .error { color: #ff5f7e; }
    .info { color: #888; }
  </style>
</head>
<body>
<div>
  <h3>Поиск правильного API Giga.pub</h3>
  <button id="checkWindow">Проверить window</button>
  <button id="tryLoad">Загрузить и проверить</button>
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
  console.log(msg);
}

// Проверяем все возможные объекты
document.getElementById('checkWindow').onclick = function() {
  addLog('=== ПРОВЕРКА WINDOW ===');
  const keys = Object.keys(window).filter(k => k.toLowerCase().includes('giga') || k.toLowerCase().includes('offer') || k.toLowerCase().includes('wall'));
  addLog('Найдено ключей с giga/offer/wall: ' + keys.length);
  keys.forEach(k => addLog('  - ' + k + ': ' + typeof window[k]));
  
  // Проверяем giga
  if (window.giga) addLog('window.giga есть', 'success');
  else addLog('window.giga НЕТ', 'error');
  
  // Проверяем loadOfferWallSDK
  if (window.loadOfferWallSDK) addLog('window.loadOfferWallSDK есть', 'success');
  else addLog('window.loadOfferWallSDK НЕТ', 'error');
  
  // Проверяем другие варианты
  if (window.OfferWall) addLog('window.OfferWall есть', 'success');
  if (window.gigaWall) addLog('window.gigaWall есть', 'success');
  if (window.Giga) addLog('window.Giga есть', 'success');
};

// Загружаем и проверяем
document.getElementById('tryLoad').onclick = function() {
  addLog('Загружаю SDK...');
  
  const script = document.createElement('script');
  script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
  
  script.onload = function() {
    addLog('Скрипт загружен', 'success');
    setTimeout(() => {
      addLog('=== ЧЕРЕЗ 1 СЕКУНДУ ===');
      
      // Проверяем все глобальные объекты
      for (let key in window) {
        if (key.toLowerCase().includes('giga') || key.toLowerCase().includes('offer') || key.toLowerCase().includes('wall')) {
          addLog('Найден: window.' + key + ' = ' + typeof window[key]);
        }
      }
      
      // Пробуем вызвать если есть
      if (window.loadOfferWallSDK && typeof window.loadOfferWallSDK === 'function') {
        addLog('Вызываю loadOfferWallSDK()...');
        try {
          const result = window.loadOfferWallSDK();
          addLog('Результат: ' + JSON.stringify(result));
        } catch(e) {
          addLog('Ошибка: ' + e.message, 'error');
        }
      }
      
      // Пробуем инициализировать если есть
      if (window.OfferWall && typeof window.OfferWall.init === 'function') {
        addLog('Вызываю OfferWall.init()...');
        try {
          window.OfferWall.init({ projectId: 6822 });
          addLog('Инициализация успешна');
        } catch(e) {
          addLog('Ошибка: ' + e.message, 'error');
        }
      }
      
    }, 1000);
  };
  
  script.onerror = function() {
    addLog('ОШИБКА загрузки скрипта!', 'error');
  };
  
  document.head.appendChild(script);
};

// Автоматическая проверка при старте
addLog('Страница загружена, проверяю...');
setTimeout(() => {
  document.getElementById('checkWindow').click();
}, 500);
</script>
</body>
</html>`;

    return new Response(html, { 
      headers: { "content-type": "text/html;charset=UTF-8" } 
    });
  }
};
