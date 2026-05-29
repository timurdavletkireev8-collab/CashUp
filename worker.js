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
      margin-top: 20px;
    }
    .log {
      background: #1a1a2e;
      padding: 12px;
      border-radius: 8px;
      margin-top: 20px;
      font-size: 12px;
      font-family: monospace;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
    }
    .success { color: #00e5b4; }
    .error { color: #ff5f7e; }
    .info { color: #888; }
  </style>
</head>
<body>
<div>
  <h3>Тест Giga.pub SDK</h3>
  <button id="loadBtn">1. Загрузить SDK вручную</button>
  <button id="checkBtn" style="background:#333">2. Проверить статус</button>
  <button id="openBtn" style="background:#7c5cfc">3. Открыть задания</button>
  <div class="log" id="log">Лог будет тут...</div>
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

addLog('Страница загружена. Giga SDK: ' + (window.giga ? 'ЕСТЬ' : 'НЕТ'), window.giga ? 'success' : 'error');

// Ручная загрузка SDK
document.getElementById('loadBtn').onclick = function() {
  addLog('Загружаю SDK вручную...');
  const script = document.createElement('script');
  script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
  script.onload = function() {
    addLog('✅ Скрипт загружен! Жду инициализации...', 'success');
    setTimeout(function() {
      addLog('Giga объект: ' + (window.giga ? 'ЕСТЬ' : 'НЕТ'), window.giga ? 'success' : 'error');
      if (window.giga) {
        addLog('Методы giga: ' + Object.keys(window.giga).join(', '));
      }
    }, 1000);
  };
  script.onerror = function() {
    addLog('❌ Ошибка загрузки скрипта!', 'error');
  };
  document.head.appendChild(script);
};

// Проверка статуса
document.getElementById('checkBtn').onclick = function() {
  addLog('Проверка: window.giga = ' + (window.giga ? 'ЕСТЬ' : 'НЕТ'));
  if (window.giga) {
    addLog('Тип: ' + typeof window.giga);
    addLog('Методы: ' + Object.keys(window.giga).join(', '));
  }
};

// Открытие заданий
document.getElementById('openBtn').onclick = function() {
  if (!window.giga) {
    addLog('❌ Giga не загружен! Сначала нажми кнопку 1', 'error');
    return;
  }
  
  addLog('Пытаюсь открыть задания...');
  
  try {
    if (typeof window.giga.show === 'function') {
      window.giga.show({
        onReward: function(reward) {
          addLog('✅ Награда! Получено: ' + JSON.stringify(reward), 'success');
          tg.HapticFeedback.notificationOccurred('success');
        },
        onClose: function() {
          addLog('📋 Окно заданий закрыто', 'info');
        },
        onError: function(err) {
          addLog('❌ Ошибка: ' + JSON.stringify(err), 'error');
        }
      });
    } else {
      addLog('❌ Метод show не найден. Объект giga: ' + JSON.stringify(window.giga), 'error');
    }
  } catch(e) {
    addLog('❌ Исключение: ' + e.message, 'error');
  }
};

// Автоматическая попытка загрузить при старте
addLog('Автоматическая загрузка SDK...');
const autoScript = document.createElement('script');
autoScript.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
autoScript.onload = function() {
  addLog('Авто-загрузка: скрипт загружен', 'success');
  setTimeout(function() {
    if (window.giga) {
      addLog('✅ SDK готов к использованию!', 'success');
    }
  }, 1500);
};
document.head.appendChild(autoScript);
</script>
</body>
</html>`;

    return new Response(html, { 
      headers: { "content-type": "text/html;charset=UTF-8" } 
    });
  }
};
