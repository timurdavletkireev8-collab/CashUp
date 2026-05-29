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
const userId = tg.initDataUnsafe?.user?.id || 'test_user';

let gigaSDK = null;

// Правильная инициализация SDK по документации
window.loadGigaSDKCallbacks = window.loadGigaSDKCallbacks || [];

window.loadGigaSDKCallbacks.push(() => {
  statusDiv.innerHTML = 'Инициализация SDK...';
  
  window.loadOfferWallSDK({ projectId: '6822' })
    .then(sdk => {
      gigaSDK = sdk;
      statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
      statusDiv.style.color = '#00e5b4';
      btn.disabled = false;
      
      // Обработчик получения награды
      sdk.on('rewardClaim', async (data) => {
        console.log('Reward claim received:', data);
        statusDiv.innerHTML = '✅ Задание выполнено! Начисление...';
        
        // Отправляем запрос на начисление награды
        try {
          const res = await fetch('/api/task-reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
          });
          const result = await res.json();
          
          if (result.success) {
            statusDiv.innerHTML = '✅ +5 TON начислено!';
            tg.HapticFeedback.notificationOccurred('success');
            tg.showAlert('Вы получили 5 TON за выполнение задания!');
            
            // Подтверждаем награду в SDK
            if (data.rewardId && data.hash) {
              sdk.confirmReward(data.rewardId, data.hash);
            }
          }
        } catch(e) {
          console.error(e);
          statusDiv.innerHTML = '❌ Ошибка начисления';
        }
      });
      
      sdk.on('close', () => {
        statusDiv.innerHTML = '✅ Готово! Нажми на кнопку';
      });
      
      sdk.on('error', (error) => {
        console.error('SDK error:', error);
        statusDiv.innerHTML = '❌ Ошибка: ' + JSON.stringify(error);
      });
    })
    .catch(error => {
      console.error('Error loading SDK:', error);
      statusDiv.innerHTML = '❌ Ошибка загрузки SDK';
      statusDiv.style.color = '#ff5f7e';
    });
});

// Загружаем SDK скрипт
const script = document.createElement('script');
script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
script.async = true;
script.onload = () => {
  statusDiv.innerHTML = 'SDK загружен, инициализация...';
};
script.onerror = () => {
  statusDiv.innerHTML = '❌ Ошибка загрузки скрипта';
  statusDiv.style.color = '#ff5f7e';
};
document.head.appendChild(script);

btn.disabled = true;

// Открываем задания
btn.onclick = function() {
  if (!gigaSDK) {
    statusDiv.innerHTML = '⏳ Подожди, SDK еще грузится...';
    return;
  }
  
  statusDiv.innerHTML = '🔄 Открываю задания...';
  
  try {
    // Открываем офферволл
    if (typeof gigaSDK.show === 'function') {
      gigaSDK.show();
    } else if (typeof gigaSDK.open === 'function') {
      gigaSDK.open();
    } else if (typeof gigaSDK.launch === 'function') {
      gigaSDK.launch();
    } else {
      statusDiv.innerHTML = '⚠️ Метод show не найден';
    }
  } catch(e) {
    statusDiv.innerHTML = '❌ Ошибка: ' + e.message;
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
