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

let gigaInstance = null;

// Загружаем и инициализируем SDK
const script = document.createElement('script');
script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
script.onload = function() {
  statusDiv.innerHTML = 'SDK загружен, инициализация...';
  
  // Ждем появления функции loadOfferWallSDK
  let attempts = 0;
  const interval = setInterval(function() {
    attempts++;
    if (window.loadOfferWallSDK) {
      clearInterval(interval);
      statusDiv.innerHTML = 'Инициализация...';
      try {
        gigaInstance = window.loadOfferWallSDK();
        statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
        statusDiv.style.color = '#00e5b4';
        btn.disabled = false;
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
script.onerror = function() {
  statusDiv.innerHTML = '❌ Ошибка загрузки скрипта';
  statusDiv.style.color = '#ff5f7e';
};
document.head.appendChild(script);

// Кнопка для открытия заданий
btn.onclick = function() {
  if (!gigaInstance) {
    statusDiv.innerHTML = '⏳ Подожди, SDK еще грузится...';
    return;
  }
  
  statusDiv.innerHTML = '🔄 Открываю задания...';
  
  try {
    if (typeof gigaInstance.show === 'function') {
      gigaInstance.show({
        onReward: function(reward) {
          statusDiv.innerHTML = '✅ Задание выполнено! +5 TON';
          statusDiv.style.color = '#00e5b4';
          tg.HapticFeedback.notificationOccurred('success');
          tg.showAlert('Вы получили 5 TON за выполнение задания!');
        },
        onClose: function() {
          statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
          statusDiv.style.color = '#00e5b4';
        },
        onError: function(error) {
          statusDiv.innerHTML = '❌ Ошибка: ' + JSON.stringify(error);
          statusDiv.style.color = '#ff5f7e';
          tg.HapticFeedback.notificationOccurred('error');
        }
      });
    } else {
      statusDiv.innerHTML = '❌ Метод show не найден';
    }
  } catch(e) {
    statusDiv.innerHTML = '❌ Ошибка: ' + e.message;
    statusDiv.style.color = '#ff5f7e';
  }
};

btn.disabled = true;
</script>
</body>
</html>`;

    return new Response(html, { 
      headers: { "content-type": "text/html;charset=UTF-8" } 
    });
  }
};
