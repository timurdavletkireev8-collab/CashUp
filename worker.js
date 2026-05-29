export default {
  async fetch(request, env, ctx) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Giga Tasks Test</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <!-- Загружаем SDK -->
  <script src="https://wall.giga.pub/api/v1/loader.js?projectId=6822"></script>
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
  <div class="status" id="status">Ожидание загрузки SDK...</div>
</div>

<script>
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const statusDiv = document.getElementById('status');
const btn = document.getElementById('taskBtn');

// Функция проверки загрузки SDK
function waitForGiga(callback) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (window.giga) {
      clearInterval(interval);
      statusDiv.innerHTML = '✅ SDK загружен! Нажми на кнопку';
      statusDiv.style.color = '#00e5b4';
      callback(true);
    } else if (attempts > 30) {
      clearInterval(interval);
      statusDiv.innerHTML = '❌ Ошибка загрузки SDK. Обнови страницу';
      statusDiv.style.color = '#ff5f7e';
      callback(false);
    }
  }, 200);
}

btn.onclick = function() {
  if (!window.giga) {
    statusDiv.innerHTML = '⏳ SDK еще грузится, подожди 2 секунды...';
    return;
  }
  
  statusDiv.innerHTML = '🔄 Открываю задания...';
  
  try {
    window.giga.show({
      onReward: function(reward) {
        statusDiv.innerHTML = '✅ Задание выполнено! Награда: ' + (reward?.amount || 5) + ' TON';
        tg.HapticFeedback.notificationOccurred('success');
      },
      onClose: function() {
        statusDiv.innerHTML = '📋 Стенка заданий закрыта';
      },
      onError: function(error) {
        console.error(error);
        statusDiv.innerHTML = '❌ Ошибка: ' + JSON.stringify(error);
        tg.HapticFeedback.notificationOccurred('error');
      }
    });
  } catch(e) {
    statusDiv.innerHTML = '❌ Ошибка: ' + e.message;
  }
};

// Ждем загрузку
waitForGiga(function(loaded) {
  if (loaded) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
});
</script>
</body>
</html>`;

    return new Response(html, { 
      headers: { "content-type": "text/html;charset=UTF-8" } 
    });
  }
};
