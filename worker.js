export default {
  async fetch(request, env, ctx) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Giga Debug</title>
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
      max-height: 500px;
      overflow-y: auto;
    }
    .success { color: #00e5b4; }
    .error { color: #ff5f7e; }
    .info { color: #888; }
  </style>
</head>
<body>
<div>
  <h3>Отладка Giga.pub</h3>
  <button id="initBtn">1. Инициализировать SDK</button>
  <button id="methodsBtn">2. Показать методы</button>
  <button id="openBtn">3. Открыть задания</button>
  <div class="log" id="log"></div>
</div>

<script>
const tg = window.Telegram.WebApp;
tg.expand();

const logDiv = document.getElementById('log');
let gigaObject = null;

function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  logDiv.innerHTML += \`<div class="\${type}">[\${time}] \${msg}</div>\`;
  logDiv.scrollTop = logDiv.scrollHeight;
  console.log(msg);
}

// Загружаем SDK
const script = document.createElement('script');
script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
script.onload = function() {
  addLog('✅ SDK скрипт загружен', 'success');
  addLog('window.loadOfferWallSDK: ' + typeof window.loadOfferWallSDK);
};
document.head.appendChild(script);

// Кнопка инициализации
document.getElementById('initBtn').onclick = function() {
  if (!window.loadOfferWallSDK) {
    addLog('❌ loadOfferWallSDK не найден! Ждите загрузки скрипта', 'error');
    return;
  }
  
  addLog('Вызываю loadOfferWallSDK()...');
  try {
    gigaObject = window.loadOfferWallSDK();
    addLog('✅ Результат: ' + typeof gigaObject, 'success');
    addLog('Объект: ' + JSON.stringify(gigaObject));
    
    // Показываем все ключи объекта
    if (gigaObject && typeof gigaObject === 'object') {
      const keys = Object.keys(gigaObject);
      addLog('Ключи объекта: ' + keys.join(', '));
    } else {
      addLog('Объект не является объектом, это: ' + typeof gigaObject);
    }
  } catch(e) {
    addLog('❌ Ошибка: ' + e.message, 'error');
  }
};

// Кнопка показа методов
document.getElementById('methodsBtn').onclick = function() {
  if (!gigaObject) {
    addLog('❌ Сначала нажми "Инициализировать SDK"', 'error');
    return;
  }
  
  addLog('=== ДОСТУПНЫЕ МЕТОДЫ ===');
  
  // Проверяем возможные методы
  const possibleMethods = ['show', 'open', 'start', 'init', 'load', 'display', 'showWall', 'openWall', 'showOfferwall'];
  
  possibleMethods.forEach(method => {
    if (typeof gigaObject[method] === 'function') {
      addLog('✅ Есть метод: ' + method, 'success');
    } else {
      addLog('❌ Нет метода: ' + method);
    }
  });
  
  // Показываем все свойства
  if (gigaObject && typeof gigaObject === 'object') {
    addLog('Все свойства:');
    for (let key in gigaObject) {
      addLog('  - ' + key + ': ' + typeof gigaObject[key]);
    }
  }
};

// Кнопка открытия
document.getElementById('openBtn').onclick = function() {
  if (!gigaObject) {
    addLog('❌ Сначала инициализируй SDK (кнопка 1)', 'error');
    return;
  }
  
  addLog('Пытаюсь открыть задания...');
  
  // Пробуем разные варианты
  if (typeof gigaObject.show === 'function') {
    addLog('Использую show()');
    gigaObject.show({
      onReward: (reward) => addLog('Награда!', 'success'),
      onClose: () => addLog('Закрыто'),
      onError: (e) => addLog('Ошибка: ' + e)
    });
  } 
  else if (typeof gigaObject.open === 'function') {
    addLog('Использую open()');
    gigaObject.open();
  }
  else if (typeof gigaObject.showWall === 'function') {
    addLog('Использую showWall()');
    gigaObject.showWall();
  }
  else if (typeof gigaObject.start === 'function') {
    addLog('Использую start()');
    gigaObject.start();
  }
  else {
    addLog('❌ Не найден подходящий метод', 'error');
    addLog('Пробуем вызвать сам объект как функцию...');
    if (typeof gigaObject === 'function') {
      try {
        const result = gigaObject();
        addLog('Результат вызова: ' + typeof result);
      } catch(e) {
        addLog('Ошибка: ' + e.message);
      }
    }
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
