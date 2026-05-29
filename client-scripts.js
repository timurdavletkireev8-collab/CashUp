// 1. Инициализация SDK
window.gigaWallSDK = null;
const sdkScript = document.createElement('script');
sdkScript.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
sdkScript.async = true;
sdkScript.onload = () => {
    // В зависимости от того, как SDK инициализируется, 
    // проверь документацию, присваивается ли он переменной GigaWall
    window.gigaWallSDK = window.GigaWall; 
    console.log("SDK загружен");
};
document.head.appendChild(sdkScript);

// 2. Функция для открытия стены заданий
function openTaskWall() {
    if (window.gigaWallSDK && typeof window.gigaWallSDK.show === 'function') {
        window.gigaWallSDK.show();
    } else {
        console.error("SDK еще не готов");
        alert("Задания загружаются, подожди секунду...");
    }
}

// 3. Привязка к кнопкам (ID кнопок из твоего HTML)
document.getElementById('btnTask').addEventListener('click', openTaskWall);
document.getElementById('btnTaskEasy').addEventListener('click', openTaskWall);
