export default {
  async fetch(request, env, ctx) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CashUp - Задания</title>
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

// Правильная загрузка SDK по документации
document.addEventListener('DOMContentLoaded', function() {
  if (!window.loadOfferWallSDK) {
    const script = document.createElement('script');
    script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
    script.async = true;
    script.onload = function() {
      statusDiv.innerHTML = '✅ SDK загружен, инициализация...';
      statusDiv.style.color = '#00e5b4';
      
      // Ждем появления функции
      let attempts = 0;
      const interval = setInterval(function() {
        attempts++;
        if (window.loadOfferWallSDK) {
          clearInterval(interval);
          statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
          btn.disabled = false;
        } else if (attempts > 30) {
          clearInterval(interval);
          statusDiv.innerHTML = '❌ Ошибка инициализации';
          statusDiv.style.color = '#ff5f7e';
        }
      }, 200);
    };
    script.onerror = function() {
      statusDiv.innerHTML = '❌ Ошибка загрузки SDK';
      statusDiv.style.color = '#ff5f7e';
    };
    document.head.appendChild(script);
  }
});

btn.disabled = true;

// Функция открытия заданий
btn.onclick = function() {
  if (!window.loadOfferWallSDK) {
    statusDiv.innerHTML = '⏳ SDK еще грузится...';
    return;
  }
  
  statusDiv.innerHTML = '🔄 Открываю задания...';
  
  try {
    // Вызываем функцию загрузки SDK
    const offerwall = window.loadOfferWallSDK();
    
    if (offerwall && typeof offerwall.show === 'function') {
      offerwall.show({
        onReward: function(data) {
          statusDiv.innerHTML = '✅ Задание выполнено! +5 TON';
          statusDiv.style.color = '#00e5b4';
          tg.HapticFeedback.notificationOccurred('success');
          
          // Отправляем запрос на начисление награды
          fetch('/api/task-reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: tg.initDataUnsafe?.user?.id })
          });
          
          tg.showAlert('Вы получили 5 TON за выполнение задания!');
        },
        onClose: function() {
          statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
        },
        onError: function(error) {
          console.error(error);
          statusDiv.innerHTML = '❌ Ошибка: ' + JSON.stringify(error);
          statusDiv.style.color = '#ff5f7e';
        }
      });
    } else {
      statusDiv.innerHTML = '⚠️ Метод show не найден. Обратитесь в поддержку';
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
