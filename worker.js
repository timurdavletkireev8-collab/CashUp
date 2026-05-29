export default {
  async fetch(request, env, ctx) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Giga Tasks</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body {
      background: #060610;
      color: white;
      font-family: system-ui;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
    }
    button {
      background: linear-gradient(135deg, #00b4ff, #7c5cfc);
      border: none;
      padding: 16px 32px;
      border-radius: 16px;
      color: white;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      width: 100%;
      max-width: 300px;
    }
    .status {
      margin-top: 20px;
      font-size: 14px;
      color: #888;
      text-align: center;
    }
    .success { color: #00e5b4; }
    .error { color: #ff5f7e; }
  </style>
</head>
<body>
<div style="text-align: center">
  <button id="taskBtn">Выполнять задания</button>
  <div class="status" id="status">Загрузка...</div>
</div>

<script>
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const statusDiv = document.getElementById('status');
const btn = document.getElementById('taskBtn');

let offerwallInstance = null;

// Загружаем SDK
const script = document.createElement('script');
script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
script.onload = function() {
  statusDiv.innerHTML = 'SDK загружен, инициализация...';
  
  let attempts = 0;
  const interval = setInterval(function() {
    attempts++;
    if (window.loadOfferWallSDK) {
      clearInterval(interval);
      try {
        // Сохраняем instance
        offerwallInstance = window.loadOfferWallSDK();
        statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
        statusDiv.style.color = '#00e5b4';
        btn.disabled = false;
        
        // Логируем все методы объекта для отладки
        console.log('Offerwall instance:', offerwallInstance);
        if (offerwallInstance) {
          const methods = Object.getOwnPropertyNames(offerwallInstance).concat(
            Object.getOwnPropertyNames(Object.getPrototypeOf(offerwallInstance))
          );
          console.log('Доступные методы:', methods);
        }
      } catch(e) {
        statusDiv.innerHTML = '❌ Ошибка: ' + e.message;
        statusDiv.style.color = '#ff5f7e';
      }
    } else if (attempts > 30) {
      clearInterval(interval);
      statusDiv.innerHTML = '❌ Ошибка загрузки SDK';
      statusDiv.style.color = '#ff5f7e';
    }
  }, 200);
};
document.head.appendChild(script);

btn.disabled = true;

btn.onclick = function() {
  if (!offerwallInstance) {
    statusDiv.innerHTML = '⏳ Подожди, SDK еще грузится...';
    return;
  }
  
  statusDiv.innerHTML = '🔄 Открываю задания...';
  
  try {
    // Пробуем разные возможные названия методов
    if (typeof offerwallInstance.launch === 'function') {
      // Метод launch как в документации офферволлов [citation:1][citation:2]
      offerwallInstance.launch();
      statusDiv.innerHTML = '✅ Задания открыты';
    } 
    else if (typeof offerwallInstance.open === 'function') {
      offerwallInstance.open();
      statusDiv.innerHTML = '✅ Задания открыты';
    }
    else if (typeof offerwallInstance.start === 'function') {
      offerwallInstance.start();
      statusDiv.innerHTML = '✅ Задания открыты';
    }
    else if (typeof offerwallInstance.show === 'function') {
      offerwallInstance.show();
      statusDiv.innerHTML = '✅ Задания открыты';
    }
    else {
      // Если нет методов, показываем что есть
      const availableMethods = [];
      for (let key in offerwallInstance) {
        if (typeof offerwallInstance[key] === 'function') {
          availableMethods.push(key);
        }
      }
      statusDiv.innerHTML = '⚠️ Доступные методы: ' + (availableMethods.join(', ') || 'нет методов');
      statusDiv.style.color = '#ff5f7e';
    }
  } catch(e) {
    statusDiv.innerHTML = '❌ Ошибка: ' + e.message;
    statusDiv.style.color = '#ff5f7e';
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
