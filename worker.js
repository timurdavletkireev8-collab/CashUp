// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────
async function sendTg(token, chatId, text) {
  try {
    if (!token) return;
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch(e) { console.error('sendTg error:', e); }
}

function isAdmin(uid) { return String(uid) === '7020322752'; }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ─── API ROUTES WITH GLOBAL ERROR HANDLING ───────────────────────────
    if (pathname.startsWith("/api/")) {
      try {
        if (!env.DB) throw new Error("Database is not bound. Check your wrangler.toml.");

        if (pathname === "/api/user" && request.method === "POST") {
          const { userId, firstName = 'User', username = '', refBy } = await request.json();
          const existing = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
          await env.DB.prepare(`
            INSERT INTO users (userId, firstName, username, lastActive)
            VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
            ON CONFLICT(userId) DO UPDATE SET firstName = ?2, username = ?3, lastActive = CURRENT_TIMESTAMP
          `).bind(userId, firstName, username).run();
          
          if (!existing && refBy && refBy !== userId) {
            const referer = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(refBy).first();
            if (referer) {
              await env.DB.prepare("UPDATE users SET referrals = referrals + 1 WHERE userId = ?").bind(refBy).run();
              await env.DB.prepare("UPDATE users SET referredBy = ? WHERE userId = ?").bind(refBy, userId).run();
            }
          }
          const user = await env.DB.prepare("SELECT *, COALESCE(ref_earned, 0) as ref_earned FROM users WHERE userId = ?").bind(userId).first();
          
          let stats = { views: 0 };
          try {
            const s = await env.DB.prepare("SELECT views FROM stats WHERE id = 'global'").first();
            if (s) stats = s;
          } catch(e) {} // Ignore if stats table doesn't exist yet

          return new Response(JSON.stringify({ user, stats }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/reward" && request.method === "POST") {
          const { userId } = await request.json();
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
          if (!u) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const newCount = (u.totalAdsWatched || 0) + 1;
          const earnAmount = 1; 
          const refBonus = 1; 
          
          await env.DB.prepare("UPDATE users SET balance = balance + ?, totalAdsWatched = totalAdsWatched + 1 WHERE userId = ?").bind(earnAmount, userId).run();
          try { await env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'").run(); } catch(e) {}

          if (u.referredBy && refBonus > 0) {
            await env.DB.prepare("UPDATE users SET balance = balance + ?, ref_earned = ref_earned + ? WHERE userId = ?").bind(refBonus, refBonus, u.referredBy).run();
          }
          if (newCount === 15 && u.referredBy) {
            await env.DB.prepare("UPDATE users SET balance = balance + 100 WHERE userId = ?").bind(userId).run();
          }
          return new Response(JSON.stringify({ success: true, adsWatched: newCount }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/task-reward" && request.method === "POST") {
          const { userId } = await request.json();
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
          const earnAmount = 10;
          const refBonus = Math.floor(earnAmount * 0.1);
          
          await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(earnAmount, userId).run();
          try { await env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'").run(); } catch(e) {}
          
          if (u && u.referredBy && refBonus > 0) {
            await env.DB.prepare("UPDATE users SET balance = balance + ?, ref_earned = ref_earned + ? WHERE userId = ?").bind(refBonus, refBonus, u.referredBy).run();
          }
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/rating") {
          const type = url.searchParams.get('type') || 'balance';
          const orderField = type === 'referrals' ? 'referrals' : 'balance';
          const { results } = await env.DB.prepare(`SELECT firstName, balance, referrals FROM users ORDER BY ${orderField} DESC LIMIT 20`).all();
          return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/my-referrals" && request.method === "POST") {
          const { userId } = await request.json();
          const { results } = await env.DB.prepare("SELECT firstName, username, totalAdsWatched, lastActive FROM users WHERE referredBy = ? ORDER BY totalAdsWatched DESC").bind(userId).all();
          return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/withdraw2" && request.method === "POST") {
          const { userId, wallet, amount } = await request.json();
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
          if (!u) return new Response(JSON.stringify({ error: "Пользователь не найден" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const MIN_WITHDRAW = 5000;
          if ((u.balance || 0) < MIN_WITHDRAW) {
            return new Response(JSON.stringify({ error: "Минимальная сумма вывода — 0.5 TON" }), { status: 400, headers: { "Content-Type": "application/json" } });
          }
          const amountUnits = Math.floor(parseFloat(amount) * 10000);
          if (amountUnits > u.balance) {
            return new Response(JSON.stringify({ error: "Недостаточно средств на балансе" }), { status: 400, headers: { "Content-Type": "application/json" } });
          }
          await env.DB.prepare("UPDATE users SET balance = balance - ? WHERE userId = ?").bind(amountUnits, userId).run();
          await env.DB.prepare("INSERT INTO withdrawals (userId, firstName, username, wallet, amount, status, createdAt) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)").bind(userId, u.firstName, u.username || '', wallet, amountUnits).run();
          
          const TOKEN = env.TOKEN || '';
          if (TOKEN) {
            await sendTg(TOKEN, '7020322752', '💸 <b>Новая заявка на вывод</b>\n👤 ' + u.firstName + (u.username ? ' (@'+u.username+')' : '') + '\n🆔 ID: ' + userId + '\n💰 Сумма: ' + (amountUnits/10000).toFixed(4) + ' TON\n👛 Кошелёк: <code>' + wallet + '</code>');
          }
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/withdrawals" && request.method === "POST") {
          const { adminId } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          const { results } = await env.DB.prepare("SELECT * FROM withdrawals ORDER BY createdAt DESC LIMIT 50").all();
          return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/withdraw-action" && request.method === "POST") {
          const { adminId, withdrawId, action } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          const w = await env.DB.prepare("SELECT * FROM withdrawals WHERE id = ?").bind(withdrawId).first();
          if (!w) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const TOKEN = env.TOKEN || '';
          if (action === 'approve') {
            await env.DB.prepare("UPDATE withdrawals SET status = 'approved' WHERE id = ?").bind(withdrawId).run();
            if (TOKEN) await sendTg(TOKEN, w.userId, '✅ <b>Вывод одобрен!</b>\nСумма: <b>' + (w.amount/10000).toFixed(4) + ' TON</b> будет отправлена на кошелёк:\n<code>' + w.wallet + '</code>\nОбработка до 24 часов.');
          } else {
            await env.DB.batch([
              env.DB.prepare("UPDATE withdrawals SET status = 'rejected' WHERE id = ?").bind(withdrawId),
              env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(w.amount, w.userId)
            ]);
            if (TOKEN) await sendTg(TOKEN, w.userId, '❌ <b>Вывод отклонён</b>\nСумма ' + (w.amount/10000).toFixed(4) + ' TON возвращена на баланс.');
          }
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/add-task" && request.method === "POST") {
          const { adminId, title, description, link, reward } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          await env.DB.prepare("INSERT INTO manual_tasks (title, description, link, reward, active, createdAt) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)").bind(title, description, link, Math.floor(parseFloat(reward) * 10000)).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/delete-task" && request.method === "POST") {
          const { adminId, taskId } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          await env.DB.prepare("UPDATE manual_tasks SET active = 0 WHERE id = ?").bind(taskId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/tasks") {
          const { results } = await env.DB.prepare("SELECT * FROM manual_tasks WHERE active = 1 ORDER BY createdAt DESC").all();
          return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/tasks/complete" && request.method === "POST") {
          const { userId, taskId } = await request.json();
          const already = await env.DB.prepare("SELECT id FROM completed_tasks WHERE userId = ? AND taskId = ?").bind(userId, taskId).first();
          if (already) return new Response(JSON.stringify({ error: "Уже выполнено" }), { status: 400, headers: { "Content-Type": "application/json" } });
          const task = await env.DB.prepare("SELECT * FROM manual_tasks WHERE id = ? AND active = 1").bind(taskId).first();
          if (!task) return new Response(JSON.stringify({ error: "Задание не найдено" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
          
          await env.DB.prepare("INSERT INTO completed_tasks (userId, firstName, username, taskId, taskTitle, status, createdAt) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)").bind(userId, u ? u.firstName : '', u ? (u.username||'') : '', taskId, task.title).run();
          
          const TOKEN = env.TOKEN || '';
          if (TOKEN) {
            await sendTg(TOKEN, '7020322752', '📋 <b>Новая заявка на задание</b>\n👤 ' + (u ? u.firstName : userId) + (u && u.username ? ' (@'+u.username+')' : '') + '\n🆔 ID: ' + userId + '\n📌 Задание: ' + task.title);
          }
          return new Response(JSON.stringify({ success: true, pending: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/task-requests" && request.method === "POST") {
          const { adminId } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          const { results } = await env.DB.prepare("SELECT * FROM completed_tasks WHERE status = 'pending' ORDER BY createdAt DESC").all();
          return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/task-action" && request.method === "POST") {
          const { adminId, completionId, action } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          const ct = await env.DB.prepare("SELECT * FROM completed_tasks WHERE id = ?").bind(completionId).first();
          if (!ct) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const task = await env.DB.prepare("SELECT * FROM manual_tasks WHERE id = ?").bind(ct.taskId).first();
          const TOKEN = env.TOKEN || '';
          if (action === 'approve') {
            const reward = task ? task.reward : 0;
            const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(ct.userId).first();
            const refBonus = Math.floor(reward * 0.1);
            await env.DB.batch([
              env.DB.prepare("UPDATE completed_tasks SET status = 'approved' WHERE id = ?").bind(completionId),
              env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(reward, ct.userId)
            ]);
            if (u && u.referredBy && refBonus > 0) {
              await env.DB.prepare("UPDATE users SET balance = balance + ?, ref_earned = ref_earned + ? WHERE userId = ?").bind(refBonus, refBonus, u.referredBy).run();
            }
            if (TOKEN) await sendTg(TOKEN, ct.userId, '✅ <b>Задание выполнено!</b>\nЗадание: <b>' + ct.taskTitle + '</b>\nНачислено: <b>' + (reward/10000).toFixed(4) + ' TON</b>');
          } else {
            await env.DB.prepare("UPDATE completed_tasks SET status = 'rejected' WHERE id = ?").bind(completionId).run();
            if (TOKEN) await sendTg(TOKEN, ct.userId, '❌ <b>Задание отклонено</b>\nЗадание: ' + ct.taskTitle + '\nПопробуй ещё раз или обратись в поддержку.');
          }
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/user-search" && request.method === "POST") {
          const { adminId, query } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ? OR username = ?").bind(query, query.replace('@','')).first();
          if (!u) return new Response(JSON.stringify({ error: "Пользователь не найден" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const { results: refs } = await env.DB.prepare("SELECT firstName, username, totalAdsWatched FROM users WHERE referredBy = ?").bind(u.userId).all();
          return new Response(JSON.stringify({ user: u, refs }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/admin/adjust-balance" && request.method === "POST") {
          const { adminId, query, amount, action } = await request.json();
          if (!isAdmin(adminId)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ? OR username = ?").bind(query, query.replace('@','')).first();
          if (!u) return new Response(JSON.stringify({ error: "Пользователь не найден" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const units = Math.floor(parseFloat(amount) * 10000);
          if (action === 'add') {
            await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(units, u.userId).run();
          } else {
            await env.DB.prepare("UPDATE users SET balance = MAX(0, balance - ?) WHERE userId = ?").bind(units, u.userId).run();
          }
          const updated = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(u.userId).first();
          const TOKEN = env.TOKEN || '';
          if (TOKEN) {
            const sign = action === 'add' ? '+' : '-';
            await sendTg(TOKEN, u.userId, (action === 'add' ? '💰' : '💸') + ' <b>Изменение баланса</b>\n' + sign + (units/10000).toFixed(4) + ' TON от администратора.');
          }
          return new Response(JSON.stringify({ success: true, newBalance: updated.balance }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/withdraw" && request.method === "POST") {
          const { userId, wallet, amount } = await request.json();
          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
          if (!u) return new Response(JSON.stringify({ error: "Пользователь не найден" }), { status: 404, headers: { "Content-Type": "application/json" } });
          const MIN_WITHDRAW = 5000;
          if ((u.balance || 0) < MIN_WITHDRAW) return new Response(JSON.stringify({ error: "Минимальная сумма вывода — 0.5 TON" }), { status: 400, headers: { "Content-Type": "application/json" } });
          const amountUnits = Math.floor(amount * 10000);
          if (amountUnits > u.balance) return new Response(JSON.stringify({ error: "Недостаточно средств на балансе" }), { status: 400, headers: { "Content-Type": "application/json" } });
          await env.DB.prepare("UPDATE users SET balance = balance - ? WHERE userId = ?").bind(amountUnits, userId).run();
          return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/api/postback" && request.method === "GET") {
          const params = url.searchParams;
          const gigaUserId = params.get("userId");
          const rewardId = params.get("rewardId");
          const amount = params.get("amount");
          const hash = params.get("hash");
          if (!gigaUserId || !rewardId || !amount || !hash) return new Response("Missing params", { status: 400 });

          const testMode = false;
          const secretKey = env.GIGAPUB_SECRET || "e9a6dc09376a8571fe204bc555f34482";
          const projectId = env.GIGAPUB_PROJECT_ID || "6822";
          const msgBuffer = new TextEncoder().encode(`${gigaUserId}:${projectId}:${rewardId}:${amount}:${secretKey}`);
          const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

          if (!testMode && hashHex !== hash) return new Response("Invalid hash", { status: 403 });

          const already = await env.DB.prepare("SELECT id FROM paid_rewards WHERE rewardId = ?").bind(String(rewardId)).first();
          if (already) return new Response("OK", { status: 200 });

          const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(String(gigaUserId)).first();
          if (!u) return new Response("OK", { status: 200 });

          const earnAmount = 5;
          const refBonus = Math.floor(earnAmount * 0.1);

          await env.DB.prepare("INSERT INTO paid_rewards (rewardId, userId, amount, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)").bind(String(rewardId), String(gigaUserId), amount).run();
          await env.DB.prepare("UPDATE users SET balance = balance + ?, totalAdsWatched = totalAdsWatched + 1 WHERE userId = ?").bind(earnAmount, String(gigaUserId)).run();
          try { await env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'").run(); } catch(e){}

          if (u.referredBy && refBonus > 0) {
            await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(refBonus, u.referredBy).run();
          }
          return new Response("OK", { status: 200 });
        }

        return new Response(JSON.stringify({ error: "Route not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

      } catch (err) {
        console.error("Worker Global API Error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // ─── HTML FRONTEND ────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>CashUp</title>
  <meta name="monetag" content="1b51258fdbdaecad54df401d8ae7e78a">
  <script src='//libtl.com/sdk.js' data-zone='11077016' data-sdk='show_11077016'></script>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
  <style>
    :root {
      --glass: rgba(255,255,255,0.07); --glass-border: rgba(255,255,255,0.12); --glass-hover: rgba(255,255,255,0.11);
      --blur: blur(32px) saturate(200%) brightness(1.08); --blur-sm: blur(20px) saturate(180%); --blur-xs: blur(12px) saturate(150%);
      --text: #ffffff; --text-dim: rgba(255,255,255,0.42); --text-mid: rgba(255,255,255,0.7);
      --accent: #00b4ff; --accent2: #7c5cfc; --accent3: #00e5b4; --gold: #f5c842; --success: #00e5b4; --danger: #ff5f7e; --ton: #0098ea;
      --r: 22px;
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    html, body { height:100%; width:100%; font-family: -apple-system, sans-serif; background: #060610; color: var(--text); overflow: hidden; }
    .bg-mesh { position:fixed; inset:0; z-index:0; background: radial-gradient(ellipse 90% 55% at 15% 5%, rgba(0,180,255,0.12) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 85% 15%, rgba(124,92,252,0.11) 0%, transparent 50%), radial-gradient(ellipse 55% 45% at 55% 85%, rgba(0,229,180,0.07) 0%, transparent 50%), #060610; animation: bgDrift 18s ease-in-out infinite alternate; }
    @keyframes bgDrift { 0% { filter: hue-rotate(0deg) brightness(1); } 100% { filter: hue-rotate(18deg) brightness(1.05); } }
    .bg-grid { position:fixed; inset:0; z-index:1; pointer-events:none; opacity:0.016; background-image: linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px); background-size: 40px 40px; }
    .app { position:relative; z-index:2; height:100vh; display:flex; flex-direction:column; }
    .scroll-area { flex:1; overflow-y:auto; overflow-x:hidden; padding:14px 14px 108px; scrollbar-width:none; }
    .scroll-area::-webkit-scrollbar { display:none; }
    .tab { display:none; animation: tabIn 0.36s cubic-bezier(0.34,1.5,0.64,1) forwards; }
    .tab.active { display:block; }
    @keyframes tabIn { from { opacity:0; transform:translateY(12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
    .glass { background: var(--glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur); border: 1px solid var(--glass-border); border-radius: var(--r); position: relative; overflow: hidden; }
    .glass::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background: linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.25) 50%, transparent 95%); pointer-events:none; }
    .glass::after { content:''; position:absolute; inset:0; pointer-events:none; background: linear-gradient(160deg, rgba(255,255,255,0.04) 0%, transparent 55%); border-radius: inherit; }
    .card { padding:20px; margin-bottom:13px; }
    .header-strip { display:flex; align-items:center; justify-content:space-between; padding:14px 16px 2px; }
    .header-logo { display:flex; align-items:center; gap:10px; }
    .logo-mark { width:38px; height:38px; border-radius:12px; background: linear-gradient(135deg, rgba(0,180,255,0.3), rgba(124,92,252,0.3)); border: 1px solid rgba(0,180,255,0.28); display:flex; align-items:center; justify-content:center; box-shadow: 0 0 18px rgba(0,180,255,0.18); }
    .logo-text { font-size:19px; font-weight:900; letter-spacing:-0.5px; background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
    .header-right { display:flex; align-items:center; gap:9px; }
    .header-info { text-align:right; }
    .header-name { font-size:13px; font-weight:700; line-height:1.2; }
    .header-bal-row { display:flex; align-items:center; gap:5px; justify-content:flex-end; margin-top:2px; }
    .header-bal-val { font-size:13px; font-weight:800; color:var(--accent); }
    .ton-badge-sm { background: rgba(0,152,234,0.2); border:1px solid rgba(0,152,234,0.35); border-radius:5px; padding:1px 5px; font-size:9px; font-weight:800; color:var(--ton); letter-spacing:0.5px; }
    .avatar-sm { width:36px; height:36px; border-radius:10px; flex-shrink:0; background: linear-gradient(135deg, rgba(0,180,255,0.25), rgba(124,92,252,0.25)); border: 1px solid rgba(255,255,255,0.14); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; color:var(--text); }
    .sec-head { margin-bottom:16px; }
    .sec-title { font-size:22px; font-weight:900; color:var(--text); letter-spacing:-0.6px; margin-bottom:4px; }
    .sec-sub { font-size:13px; color:var(--text-dim); line-height:1.6; }
    .btn-primary { width:100%; padding:17px 20px; border-radius:16px; border:none; cursor:pointer; font-size:15px; font-weight:800; color:#fff; background: linear-gradient(135deg, rgba(0,180,255,0.38), rgba(124,92,252,0.38)); backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm); border: 1px solid rgba(0,180,255,0.38); display:flex; align-items:center; justify-content:center; gap:10px; transition: all 0.22s; position:relative; overflow:hidden; box-shadow: 0 4px 24px rgba(0,180,255,0.13), inset 0 1px 0 rgba(255,255,255,0.13); }
    .btn-primary:active { transform:scale(0.97); opacity:0.85; }
    .btn-ghost { width:100%; padding:15px 20px; border-radius:14px; border:1px solid var(--glass-border); background: var(--glass); backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm); color:var(--text-mid); font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px; transition: all 0.2s; margin-top:10px; }
    .btn-ghost:active { background: var(--glass-hover); transform:scale(0.98); }
    .btn-danger { width:100%; padding:17px 20px; border-radius:16px; border:none; cursor:pointer; font-size:15px; font-weight:800; color:#fff; background: linear-gradient(135deg, rgba(255,95,126,0.35), rgba(124,92,252,0.3)); backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm); border: 1px solid rgba(255,95,126,0.38); display:flex; align-items:center; justify-content:center; gap:10px; transition: all 0.22s; box-shadow: 0 4px 24px rgba(255,95,126,0.1), inset 0 1px 0 rgba(255,255,255,0.1); }
    .btn-danger:active { transform:scale(0.97); opacity:0.85; }
    .task-toggle { display:flex; gap:6px; margin-bottom:16px; background: rgba(255,255,255,0.04); border:1px solid var(--glass-border); border-radius:14px; padding:4px; }
    .task-toggle-btn { flex:1; padding:10px; border-radius:11px; font-size:13px; font-weight:800; color:var(--text-dim); background:transparent; border:1px solid transparent; cursor:pointer; transition: all 0.25s; }
    .task-toggle-btn.active { background: rgba(124,92,252,0.22); border-color: rgba(124,92,252,0.32); color:var(--text); box-shadow: 0 2px 10px rgba(124,92,252,0.12); }
    .task-pane { display:none; }
    .task-pane.active { display:block; animation: tabIn 0.3s cubic-bezier(0.34,1.5,0.64,1) forwards; }
    .section-card { padding:26px 22px; margin-bottom:13px; text-align:center; }
    .section-card-icon { width:58px; height:58px; border-radius:18px; margin:0 auto 18px; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:900; color:var(--text); }
    .icon-tasks-hard { background: linear-gradient(135deg, rgba(255,95,126,0.2), rgba(124,92,252,0.2)); border:1px solid rgba(255,95,126,0.22); box-shadow: 0 6px 24px rgba(255,95,126,0.1); }
    .icon-tasks-easy { background: linear-gradient(135deg, rgba(0,229,180,0.2), rgba(0,180,255,0.2)); border:1px solid rgba(0,229,180,0.22); box-shadow: 0 6px 24px rgba(0,229,180,0.1); }
    .icon-ads { background: linear-gradient(135deg, rgba(0,180,255,0.2), rgba(0,152,234,0.18)); border:1px solid rgba(0,180,255,0.24); box-shadow: 0 6px 24px rgba(0,180,255,0.12); }
    .difficulty-badge { display:inline-flex; align-items:center; gap:6px; border-radius:20px; padding:5px 14px; font-size:11px; font-weight:800; letter-spacing:0.8px; text-transform:uppercase; margin-bottom:16px; }
    .badge-hard { background: rgba(255,95,126,0.13); border:1px solid rgba(255,95,126,0.28); color:var(--danger); }
    .badge-easy { background: rgba(0,229,180,0.13); border:1px solid rgba(0,229,180,0.28); color:var(--success); }
    .badge-ads  { background: rgba(0,152,234,0.13); border:1px solid rgba(0,152,234,0.28); color:var(--ton); }
    .card-title { font-size:19px; font-weight:900; margin-bottom:8px; letter-spacing:-0.3px; }
    .card-desc { font-size:13px; color:var(--text-mid); line-height:1.75; margin-bottom:22px; }
    .task-note { font-size:12px; color:var(--text-dim); line-height:1.65; margin-top:16px; padding:12px 14px; background:rgba(255,255,255,0.04); border-radius:12px; border-left:2px solid rgba(0,180,255,0.32); text-align:left; }
    @keyframes pulse-ring { 0% { transform:scale(1); opacity:0.45; } 100% { transform:scale(1.13); opacity:0; } }
    .pulse-wrap { position:relative; }
    .pulse-ring { position:absolute; inset:0; border-radius:16px; border:2px solid rgba(0,180,255,0.45); animation:pulse-ring 2.2s ease-out infinite; pointer-events:none; }
    .ref-hero { padding:22px; margin-bottom:13px; text-align:center; }
    .ref-avatar-icon { width:58px; height:58px; border-radius:18px; margin:0 auto 14px; background: linear-gradient(135deg, rgba(0,229,180,0.2), rgba(0,180,255,0.15)); border:1px solid rgba(0,229,180,0.22); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:900; color:var(--text); }
    .ref-hero-title { font-size:19px; font-weight:900; margin-bottom:8px; letter-spacing:-0.3px; }
    .ref-hero-desc { font-size:13px; color:var(--text-mid); line-height:1.75; }
    .ref-hero-desc b { color:var(--accent3); }
    .ref-stats-row { display:flex; gap:10px; margin-bottom:13px; }
    .ref-stat-card { flex:1; padding:16px; text-align:center; }
    .ref-stat-val { font-size:24px; font-weight:900; color:var(--text); letter-spacing:-1px; }
    .ref-stat-label { font-size:10px; color:var(--text-dim); font-weight:700; margin-top:3px; text-transform:uppercase; letter-spacing:0.5px; }
    .ref-note { padding:14px 16px; border-radius:14px; margin-bottom:13px; background: linear-gradient(135deg, rgba(0,229,180,0.07), rgba(0,180,255,0.05)); border:1px solid rgba(0,229,180,0.16); font-size:12.5px; color:var(--text-mid); line-height:1.75; }
    .ref-note b { color:var(--accent3); }
    .ref-link-label { font-size:10px; font-weight:800; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
    .ref-link-box { display:flex; align-items:center; gap:10px; background: rgba(255,255,255,0.04); border:1px solid var(--glass-border); border-radius:14px; padding:13px 16px; margin-bottom:13px; }
    .ref-link-text { flex:1; font-size:12px; color:var(--text-dim); font-family:'SF Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .copy-btn { background: rgba(0,180,255,0.18); border:1px solid rgba(0,180,255,0.32); border-radius:9px; padding:7px 14px; color:var(--accent); font-size:12px; font-weight:800; cursor:pointer; white-space:nowrap; transition:all 0.2s; }
    .copy-btn:active { opacity:0.7; transform:scale(0.96); }
    .ref-count-badge { display:inline-flex; align-items:center; background: rgba(0,180,255,0.14); border:1px solid rgba(0,180,255,0.24); border-radius:8px; padding:3px 9px; font-size:12px; font-weight:800; color:var(--accent); margin-left:8px; }
    .prof-hero { display:flex; align-items:center; gap:16px; padding:22px; margin-bottom:13px; }
    .prof-avatar { width:64px; height:64px; border-radius:18px; flex-shrink:0; background: linear-gradient(135deg, rgba(0,180,255,0.28), rgba(124,92,252,0.28)); border:1px solid rgba(255,255,255,0.16); display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:900; color:var(--text); box-shadow: 0 0 28px rgba(0,180,255,0.12); }
    .prof-name { font-size:20px; font-weight:900; margin-bottom:4px; letter-spacing:-0.5px; }
    .prof-id { font-size:12px; color:var(--text-dim); }
    .stat-row { display:flex; align-items:center; padding:15px 0; border-bottom:1px solid rgba(255,255,255,0.07); }
    .stat-row:last-child { border-bottom:none; padding-bottom:0; }
    .stat-label { flex:1; font-size:14px; color:var(--text-dim); }
    .stat-val { font-size:15px; font-weight:800; color:var(--text); }
    .trophy-row { display:flex; align-items:center; gap:14px; padding:18px 20px; cursor:pointer; transition:all 0.2s; }
    .trophy-row:active { opacity:0.8; }
    .trophy-icon-wrap { width:44px; height:44px; border-radius:13px; flex-shrink:0; background: linear-gradient(135deg, rgba(245,200,66,0.22), rgba(245,200,66,0.08)); border:1px solid rgba(245,200,66,0.28); display:flex; align-items:center; justify-content:center; }
    .trophy-texts .t1 { font-size:15px; font-weight:700; }
    .trophy-texts .t2 { font-size:12px; color:var(--text-dim); margin-top:2px; }
    .withdraw-sub { font-size:13px; color:var(--text-dim); line-height:1.65; margin-bottom:20px; }
    .input-label { font-size:11px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:7px; }
    .glass-input { width:100%; padding:14px 16px; background: rgba(255,255,255,0.05); border:1px solid var(--glass-border); border-radius:13px; color:var(--text); font-size:14px; font-weight:500; outline:none; transition: border-color 0.2s, box-shadow 0.2s; backdrop-filter: var(--blur-xs); margin-bottom:14px; font-family: inherit; }
    .glass-input::placeholder { color:var(--text-dim); }
    .glass-input:focus { border-color: rgba(0,180,255,0.45); box-shadow: 0 0 0 3px rgba(0,180,255,0.1); }
    .withdraw-min { display:flex; align-items:center; gap:8px; padding:11px 14px; border-radius:12px; margin-bottom:18px; background: rgba(0,152,234,0.08); border:1px solid rgba(0,152,234,0.18); font-size:12px; color:var(--text-mid); }
    .withdraw-min b { color:var(--ton); }
    .info-card { padding:22px; margin-bottom:13px; }
    .info-title { font-size:16px; font-weight:800; margin-bottom:10px; }
    .info-text { font-size:13px; color:var(--text-dim); line-height:1.8; }
    .ton-inline { display:inline-flex; align-items:center; gap:4px; background: rgba(0,152,234,0.14); border:1px solid rgba(0,152,234,0.26); border-radius:7px; padding:2px 8px; font-size:11px; font-weight:800; color:var(--ton); }
    .modal-bg { position:fixed; inset:0; z-index:300; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display:none; align-items:flex-end; }
    .modal-bg.open { display:flex; }
    .modal-sheet { width:100%; max-height:82vh; background: rgba(10,10,20,0.95); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur); border:1px solid rgba(255,255,255,0.1); border-radius:26px 26px 0 0; display:flex; flex-direction:column; animation: sheetUp 0.3s cubic-bezier(0.34,1.4,0.64,1); }
    @keyframes sheetUp { from { transform:translateY(50px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    .modal-handle { width:38px; height:4px; border-radius:2px; background:rgba(255,255,255,0.16); margin:13px auto 0; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 14px; border-bottom:1px solid rgba(255,255,255,0.08); }
    .modal-head h3 { font-size:17px; font-weight:900; }
    .modal-x { width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.08); border:none; color:var(--text-dim); cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .modal-body { overflow-y:auto; padding:16px 20px 30px; flex:1; scrollbar-width:none; }
    .modal-body::-webkit-scrollbar { display:none; }
    .toggle-row { display:flex; gap:8px; margin-bottom:18px; }
    .tgl { flex:1; padding:11px; border-radius:11px; font-size:13px; font-weight:800; color:var(--text-dim); background:rgba(255,255,255,0.05); border:1px solid transparent; cursor:pointer; transition:all 0.2s; text-align:center; }
    .tgl.on { background:rgba(0,180,255,0.16); border-color:rgba(0,180,255,0.28); color:var(--accent); }
    .r-row { display:flex; align-items:center; gap:14px; padding:13px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
    .r-row:last-child { border-bottom:none; }
    .r-pos { width:32px; text-align:center; font-size:15px; font-weight:800; color:var(--text-dim); }
    .r-name { flex:1; font-size:14px; font-weight:600; }
    .r-val { font-size:13px; font-weight:800; color:var(--accent); }
    .ref-item-m { display:flex; align-items:center; gap:13px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
    .ref-item-m:last-child { border-bottom:none; }
    .ref-av-m { width:38px; height:38px; border-radius:11px; background:rgba(255,255,255,0.07); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0; }
    .ref-prog-wrap { flex:1; min-width:0; }
    .ref-prog-name { font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ref-prog-bar { height:3px; background:rgba(255,255,255,0.1); border-radius:99px; margin-top:7px; overflow:hidden; }
    .ref-prog-fill { height:100%; border-radius:99px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
    .ref-prog-num { font-size:10px; color:var(--text-dim); margin-top:3px; }
    .badge-done { font-size:10px; font-weight:800; color:var(--success); text-transform:uppercase; letter-spacing:0.5px; }
    .badge-wait { font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; }
    .nav-dock { position:fixed; bottom:0; left:0; right:0; z-index:100; padding:0 12px; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
    .nav-inner { background: rgba(8,8,18,0.82); backdrop-filter: blur(34px) saturate(220%); -webkit-backdrop-filter: blur(34px) saturate(220%); border:1px solid rgba(255,255,255,0.1); border-radius:28px; display:flex; justify-content:space-around; align-items:center; padding:8px 6px; box-shadow: 0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07); }
    .nav-item { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; color:rgba(255,255,255,0.28); cursor:pointer; transition:all 0.28s; padding:5px 0; position:relative; }
    .nav-item svg { width:22px; height:22px; transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1); }
    .nav-item span { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; transition:all 0.28s; }
    .nav-item.active { color:var(--text); }
    .nav-item.active svg { transform:translateY(-2px) scale(1.12); filter:drop-shadow(0 0 7px rgba(0,180,255,0.6)); }
    .nav-item.active span { color:var(--accent); }
    .nav-dot { width:4px; height:4px; border-radius:50%; background:var(--accent); position:absolute; bottom:-1px; opacity:0; transition:opacity 0.28s; box-shadow:0 0 6px var(--accent); }
    .nav-item.active .nav-dot { opacity:1; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spin { animation:spin 0.85s linear infinite; display:inline-block; }
  </style>
</head>
<body>
<div class="bg-mesh"></div>
<div class="bg-grid"></div>

<div class="app">
  <div class="header-strip">
    <div class="header-logo">
      <div class="logo-mark">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="rgba(0,180,255,0.9)" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5" stroke="rgba(124,92,252,0.9)" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 12l10 5 10-5" stroke="rgba(0,180,255,0.6)" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="logo-text">CashUp</span>
    </div>
    <div class="header-right">
      <div class="header-info">
        <div class="header-name" id="nameHead">Загрузка...</div>
        <div class="header-bal-row">
          <div class="header-bal-val" id="balHead">0</div>
          <div class="ton-badge-sm">TON</div>
        </div>
      </div>
      <div class="avatar-sm" id="avHead">C</div>
    </div>
  </div>

  <div class="scroll-area">
    <div id="tabTasks" class="tab active">
      <div class="sec-head">
        <div class="sec-title">Задания</div>
        <div class="sec-sub">Выполняй задания и получай вознаграждение в TON</div>
      </div>
      <div class="task-toggle">
        <button class="task-toggle-btn active" id="btnHard" onclick="switchTaskPane('hard')">Авто задания</button>
        <button class="task-toggle-btn" id="btnEasy" onclick="switchTaskPane('easy')">Ручные задания</button>
      </div>
      <div id="paneHard" class="task-pane active">
        <div class="glass section-card">
          <div class="difficulty-badge badge-hard">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>
            Сложные задания
          </div>
          <div class="section-card-icon icon-tasks-hard">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/>
              <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M9 10l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="card-title">Партнёрские задания</div>
          <div class="card-desc">Задания повышенной сложности — больше действий, но выше вознаграждение.</div>
          <div class="pulse-wrap">
            <div class="pulse-ring" style="border-color:rgba(255,95,126,0.4);"></div>
            <button class="btn-primary" id="btnTask" style="background:linear-gradient(135deg,rgba(255,95,126,0.35),rgba(124,92,252,0.35));border-color:rgba(255,95,126,0.38);">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><polyline points="20,6 9,17 4,12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Выполнять задания
            </button>
          </div>
          <div class="task-note"><strong style="color:var(--text-mid);">Важно:</strong> после выполнения задания награда зачислится автоматически.</div>
        </div>
      </div>
      <div id="paneEasy" class="task-pane">
        <div class="glass section-card">
          <div class="difficulty-badge badge-easy">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><polyline points="20,6 9,17 4,12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
            Лёгкие задания
          </div>
          <div class="section-card-icon icon-tasks-easy">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><polyline points="8.5,12 11,14.5 15.5,9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="card-title">Ручные задания</div>
          <div class="card-desc">Выполни действие и нажми кнопку — после проверки получишь TON.</div>
          <div id="manualTasksList" style="margin-top:12px;">
            <div style="text-align:center;padding:24px;color:var(--text-dim);"><svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31" stroke-dashoffset="10"/></svg></div>
          </div>
        </div>
      </div>
    </div>

    <div id="tabAds" class="tab">
      <div class="sec-head">
        <div class="sec-title">Реклама</div>
        <div class="sec-sub">Смотри рекламу и получай вознаграждение в TON</div>
      </div>
      <div class="glass section-card">
        <div class="difficulty-badge badge-ads"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>Просмотр рекламы</div>
        <div class="section-card-icon icon-ads"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/><polygon points="10,9 16,12 10,15" fill="currentColor"/></svg></div>
        <div class="card-title">Смотри рекламу — получай TON</div>
        <div class="card-desc">Каждый просмотренный ролик конвертируется в криптовалюту TON.</div>
        <div class="pulse-wrap">
          <div class="pulse-ring"></div>
          <button class="btn-primary" id="btnWatch" style="background:linear-gradient(135deg,rgba(0,152,234,0.4),rgba(0,180,255,0.35));border-color:rgba(0,152,234,0.42);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>Смотреть рекламу
          </button>
        </div>
        <div style="text-align:center; margin-top:14px;"><span class="ton-inline"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>+0.0001 TON за просмотр</span></div>
        <div style="text-align:center; font-size:11.5px; color:var(--text-dim); margin-top:10px; line-height:1.7; padding:0 4px;">Вывод доступен от 0.5 TON.</div>
      </div>
    </div>

    <div id="tabRef" class="tab">
      <div class="sec-head"><div class="sec-title">Рефералы</div><div class="sec-sub">Приглашай друзей и зарабатывай TON вместе</div></div>
      <div class="glass ref-hero">
        <div class="ref-avatar-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M23 21v-2a4 4 0 00-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
        <div class="ref-hero-title">Зарабатывай с друзьями</div>
        <div class="ref-hero-desc">Получай <b>+0.01 TON</b> за друга и <b>10%</b> от его заработка.</div>
      </div>
      <div class="ref-stats-row">
        <div class="glass ref-stat-card"><div class="ref-stat-val" id="refCountMain">0</div><div class="ref-stat-label">Рефералов</div></div>
        <div class="glass ref-stat-card"><div class="ref-stat-val" id="refEarnMain">0</div><div class="ref-stat-label">Баланс TON</div></div>
      </div>
      <div class="ref-link-label">Твоя реферальная ссылка</div>
      <div class="ref-link-box">
        <div class="ref-link-text" id="refLinkBox">Загрузка...</div>
        <button class="copy-btn" onclick="copyRef()">Копировать</button>
      </div>
      <button class="btn-primary" onclick="shareRef()">Пригласить друга</button>
      <button class="btn-ghost" onclick="openMyRefs()">Мои рефералы <span class="ref-count-badge" id="refBadge">0</span></button>
    </div>

    <div id="tabProfile" class="tab">
      <div class="sec-title" style="margin-bottom:4px;">Профиль</div>
      <div class="sec-sub" style="margin-bottom:16px;">Статистика аккаунта</div>
      <div class="glass prof-hero">
        <div class="prof-avatar" id="avProf">C</div>
        <div><div class="prof-name" id="nameProf">User</div><div class="prof-id" id="idProf">ID: —</div></div>
      </div>
      <button class="btn-danger" onclick="openWithdraw()" style="margin-bottom: 13px;">Вывести средства</button>
      <div class="glass card">
        <div class="stat-row"><div class="stat-label">Баланс</div><div class="stat-val" id="profBal">0 <span style="font-size:11px;color:var(--ton);">TON</span></div></div>
        <div class="stat-row"><div class="stat-label">Просмотров рекламы</div><div class="stat-val" id="profAds">0</div></div>
        <div class="stat-row"><div class="stat-label">Рефералов</div><div class="stat-val" id="profRefs">0</div></div>
      </div>
      <div class="glass" style="margin-bottom:13px; overflow:hidden;" onclick="openRating()">
        <div class="trophy-row">
          <div class="trophy-icon-wrap"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M8 21h8M12 17v4M17 3H7l1 7c0 2.21 1.79 4 4 4s4-1.79 4-4l1-7z" stroke="#f5c842" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 4h2a2 2 0 011.92 2.56L19 11M7 4H5a2 2 0 00-1.92 2.56L5 11" stroke="#f5c842" stroke-width="2" stroke-linecap="round"/></svg></div>
          <div class="trophy-texts"><div class="t1">Глобальный рейтинг</div></div>
        </div>
      </div>
    </div>

    <div id="tabInfo" class="tab">
      <div class="sec-title" style="margin-bottom:4px;">О проекте</div>
      <div class="sec-sub" style="margin-bottom:16px;">Официальная информация</div>
      <div class="glass info-card"><div class="info-title">Как работает CashUp</div><div class="info-text">CashUp — платформа заработка. Все выплаты в TON.</div></div>
      <button class="btn-primary" onclick="tg.openTelegramLink('https://t.me/')" style="margin-bottom:10px;">Новостной канал</button>
      <button class="btn-ghost" onclick="tg.openTelegramLink('https://t.me/cashup_support')">Поддержка</button>
    </div>

    <div id="tabAdmin" class="tab">
      <div class="sec-title" style="margin-bottom:4px;">Панель администратора</div>
      <div class="glass card" style="margin-bottom:13px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:14px;">Заявки на вывод</div>
        <div id="adminWithdrawals"><div style="text-align:center;padding:20px;color:var(--text-dim);">Загрузка...</div></div>
      </div>
      <div class="glass card" style="margin-bottom:13px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:14px;">Заявки на задания</div>
        <div id="adminTaskRequests"><div style="text-align:center;padding:20px;color:var(--text-dim);">Загрузка...</div></div>
      </div>
      <div class="glass card" style="margin-bottom:13px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:14px;">Добавить ручное задание</div>
        <input class="glass-input" id="adminTaskTitle" placeholder="Название" />
        <input class="glass-input" id="adminTaskDesc" placeholder="Описание" />
        <input class="glass-input" id="adminTaskLink" placeholder="Ссылка" />
        <input class="glass-input" id="adminTaskReward" type="number" placeholder="Награда TON" step="0.001" />
        <button class="btn-primary" onclick="adminAddTask()">Добавить</button>
      </div>
      <div class="glass card" style="margin-bottom:13px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:14px;">Активные задания</div>
        <div id="adminTasksList"></div>
      </div>
      <div class="glass card" style="margin-bottom:13px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:14px;">Поиск пользователя</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input class="glass-input" id="adminUserQuery" placeholder="ID или @username" style="margin-bottom:0;flex:1;" />
          <button class="btn-primary" onclick="adminSearchUser()" style="width:auto;padding:14px 16px;">Искать</button>
        </div>
        <div id="adminUserResult"></div>
      </div>
      <div class="glass card" style="margin-bottom:13px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:14px;">Управление балансом</div>
        <input class="glass-input" id="adminBalQuery" placeholder="ID или @username" />
        <input class="glass-input" id="adminBalAmount" type="number" placeholder="Сумма в TON" step="0.001" />
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button class="btn-primary" onclick="adminAdjustBalance('add')">Выдать</button>
          <button class="btn-primary" onclick="adminAdjustBalance('subtract')" style="background:linear-gradient(135deg,rgba(255,95,126,0.35),rgba(124,92,252,0.3));">Забрать</button>
        </div>
        <div id="adminBalResult" style="margin-top:10px;font-size:13px;color:var(--success);"></div>
      </div>
    </div>
  </div>

  <div class="nav-dock">
    <div class="nav-inner">
      <div class="nav-item active" id="nav-tasks" onclick="goTab('tabTasks','nav-tasks')"><span>Задания</span></div>
      <div class="nav-item" id="nav-ads" onclick="goTab('tabAds','nav-ads')"><span>Реклама</span></div>
      <div class="nav-item" id="nav-ref" onclick="goTab('tabRef','nav-ref')"><span>Рефералы</span></div>
      <div class="nav-item" id="nav-profile" onclick="goTab('tabProfile','nav-profile')"><span>Профиль</span></div>
      <div class="nav-item" id="nav-info" onclick="goTab('tabInfo','nav-info')"><span>Инфо</span></div>
      <div class="nav-item" id="nav-admin" onclick="goTab('tabAdmin','nav-admin')" style="display:none;"><span>Админ</span></div>
    </div>
  </div>
</div>

<div class="modal-bg" id="modalWithdraw" onclick="bgClose('modalWithdraw',event)"><div class="modal-sheet"><div class="modal-head"><h3>Вывод средств</h3><button class="modal-x" onclick="closeModal('modalWithdraw')">✕</button></div><div class="modal-body"><div class="withdraw-min">Баланс: <b id="withdrawBal">0 TON</b></div><div class="input-label">TON-кошелёк</div><input class="glass-input" id="walletInput" type="text" /><div class="input-label">Сумма вывода (TON)</div><input class="glass-input" id="amountInput" type="number" min="0.5" step="0.01" /><button class="btn-danger" onclick="doWithdraw()">Запросить вывод</button></div></div></div>
<div class="modal-bg" id="modalRefs" onclick="bgClose('modalRefs',event)"><div class="modal-sheet"><div class="modal-head"><h3>Мои рефералы</h3><button class="modal-x" onclick="closeModal('modalRefs')">✕</button></div><div class="modal-body" id="bodyRefs"></div></div></div>
<div class="modal-bg" id="modalRating" onclick="bgClose('modalRating',event)"><div class="modal-sheet"><div class="modal-head"><h3>Рейтинг</h3><button class="modal-x" onclick="closeModal('modalRating')">✕</button></div><div class="modal-body"><div class="toggle-row"><div class="tgl on" id="tgBal" onclick="loadRating('balance')">По балансу</div><div class="tgl" id="tgRef" onclick="loadRating('referrals')">По рефералам</div></div><div id="ratingList"></div></div></div></div>

<script>
// --- ЗАЩИТА ИНИЦИАЛИЗАЦИИ ТЕЛЕГРАМА ---
const tg = window.Telegram?.WebApp || {
  initDataUnsafe: {}, expand: ()=>{},
  HapticFeedback: { impactOccurred: ()=>{}, notificationOccurred: ()=>{}, selectionChanged: ()=>{} },
  showAlert: (msg) => alert(msg), openTelegramLink: (u) => window.open(u, '_blank'), openLink: (u) => window.open(u, '_blank')
};
if (tg.expand) tg.expand();
if (tg.setHeaderColor) tg.setHeaderColor('#060610');
if (tg.setBackgroundColor) tg.setBackgroundColor('#060610');

const user = tg.initDataUnsafe?.user || { id: '123456', first_name: 'User', username: 'guest' };
const userId = user.id.toString();
const botUsername = 'CashUpTaskBot';
const startParam = tg.initDataUnsafe?.start_param || (window.location.hash.includes('ref=') ? window.location.hash.split('ref=')[1].split('&')[0] : null);
const refUrl = 'https://t.me/' + botUsername + '?start=' + userId;

let currentBalance = 0;
let gigaSDK = null;

// --- ЗАЩИТА ADSGRAM ОТ БЛОКИРОВЩИКОВ РЕКЛАМЫ ---
let Ads = null;
try {
  if (window.Adsgram) {
    Ads = window.Adsgram.init({ blockId: "24601" });
  } else {
    console.warn("Adsgram script failed to load (adblocker?)");
  }
} catch(e) {
  console.error("Adsgram init error:", e);
}

// --- БЕЗОПАСНАЯ СИНХРОНИЗАЦИЯ С ОБРАБОТКОЙ ОШИБОК БД ---
async function syncData() {
  try {
    const r = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, firstName: user.first_name, username: user.username, refBy: startParam })
    });
    
    if (!r.ok) {
      const errTxt = await r.text();
      document.getElementById('nameHead').textContent = 'Ошибка сервера';
      document.getElementById('balHead').textContent = 'ERR';
      console.error("Server API Error:", errTxt);
      return;
    }

    const d = await r.json();
    if (d.error) {
      document.getElementById('nameHead').textContent = 'Ошибка БД';
      console.error(d.error);
      return;
    }

    const u = d.user;
    if (!u) {
      document.getElementById('nameHead').textContent = 'Юзер не найден';
      return;
    }

    currentBalance = u.balance || 0;
    const bal = (currentBalance / 10000).toFixed(5);
    const refs = u.referrals || 0;
    const ads = u.totalAdsWatched || 0;
    const ini = (u.firstName || 'U').charAt(0).toUpperCase();

    document.getElementById('balHead').textContent = bal;
    document.getElementById('profBal').innerHTML = bal + ' <span style="font-size:11px;color:var(--ton);">TON</span>';
    document.getElementById('profAds').textContent = ads;
    document.getElementById('profRefs').textContent = refs;
    document.getElementById('refBadge').textContent = refs;
    document.getElementById('refCountMain').textContent = refs;
    document.getElementById('refEarnMain').textContent = ((u.ref_earned || 0) / 10000).toFixed(5);
    document.getElementById('withdrawBal').textContent = (currentBalance / 10000).toFixed(4) + ' TON';

    ['avHead','avProf'].forEach(id => document.getElementById(id).textContent = ini);
    ['nameHead','nameProf'].forEach(id => document.getElementById(id).textContent = u.firstName);
    document.getElementById('idProf').textContent = 'ID: ' + userId;
    document.getElementById('refLinkBox').textContent = refUrl;
  } catch(e) {
    document.getElementById('nameHead').textContent = 'Нет связи';
    console.error("Fetch API Crash:", e);
  }
}

async function doTaskReward() {
  try {
    const r = await fetch('/api/task-reward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    const data = await r.json();
    if (data.success) {
      tg.HapticFeedback.notificationOccurred('success');
      syncData();
      tg.showAlert('Вы получили награду!');
    }
  } catch(e) { console.error(e); }
}

window.loadGigaSDKCallbacks = window.loadGigaSDKCallbacks || [];
window.loadGigaSDKCallbacks.push(() => {
  if (window.loadOfferWallSDK) {
    window.loadOfferWallSDK({ projectId: '6822', userId: userId }).then(sdk => {
      gigaSDK = sdk;
      sdk.on('rewardClaim', async (data) => {
        if (data.rewardId && data.hash) sdk.confirmReward(data.rewardId, data.hash);
        setTimeout(() => syncData(), 2000);
      });
    }).catch(e => console.error(e));
  }
});

(function() {
  const script = document.createElement('script');
  script.src = 'https://wall.giga.pub/api/v1/loader.js?projectId=6822';
  script.async = true;
  document.head.appendChild(script);
})();

document.getElementById('btnWatch').onclick = async () => {
  tg.HapticFeedback.impactOccurred('medium');
  if (!Ads) { tg.showAlert('Рекламный модуль заблокирован или не загружен.'); return; }
  try {
    if (typeof show_11077016 === 'function') await show_11077016();
    const r = await fetch('/api/reward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    const d = await r.json();
    tg.HapticFeedback.notificationOccurred('success');
    if (d.adsWatched === 15) tg.showAlert('Получен бонус!');
    syncData();
  } catch(e) { tg.HapticFeedback.notificationOccurred('error'); }
};

document.getElementById('btnTask').onclick = () => {
  tg.HapticFeedback.impactOccurred('medium');
  if (!gigaSDK) { tg.showAlert('Загрузка заданий... Попробуйте через секунду'); return; }
  try {
    if (typeof gigaSDK.show === 'function') gigaSDK.show();
    else if (typeof gigaSDK.open === 'function') gigaSDK.open();
    else if (typeof gigaSDK.launch === 'function') gigaSDK.launch();
  } catch(e) { tg.showAlert('Ошибка открытия заданий'); }
};

window.switchTaskPane = (type) => {
  tg.HapticFeedback.selectionChanged();
  document.getElementById('paneHard').classList.toggle('active', type === 'hard');
  document.getElementById('paneEasy').classList.toggle('active', type === 'easy');
  document.getElementById('btnHard').classList.toggle('active', type === 'hard');
  document.getElementById('btnEasy').classList.toggle('active', type === 'easy');
};

window.openWithdraw = () => { tg.HapticFeedback.impactOccurred('light'); document.getElementById('modalWithdraw').classList.add('open'); };

window.doWithdraw = async () => {
  const wallet = document.getElementById('walletInput').value.trim();
  const amount = parseFloat(document.getElementById('amountInput').value);
  if (!wallet || wallet.length < 10) { tg.showAlert('Введи корректный кошелёк.'); return; }
  if (!amount || amount < 0.5) { tg.showAlert('Минимальная сумма — 0.5 TON.'); return; }
  if (amount > currentBalance / 10000) { tg.showAlert('Недостаточно средств.'); return; }

  tg.HapticFeedback.impactOccurred('medium');
  try {
    const r = await fetch('/api/withdraw2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, wallet, amount }) });
    const d = await r.json();
    if (d.success) {
      tg.HapticFeedback.notificationOccurred('success');
      tg.showAlert('Заявка на вывод отправлена!');
      document.getElementById('walletInput').value = '';
      document.getElementById('amountInput').value = '';
      closeModal('modalWithdraw');
      syncData();
    } else { tg.showAlert(d.error || 'Ошибка'); }
  } catch(e) { tg.showAlert('Ошибка соединения'); }
};

window.goTab = (tabId, navId) => {
  tg.HapticFeedback.impactOccurred('light');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.getElementById(navId).classList.add('active');
};

window.shareRef = () => {
  tg.HapticFeedback.impactOccurred('light');
  tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(refUrl) + '&text=Зарабатывай TON!');
};

window.copyRef = () => { navigator.clipboard.writeText(refUrl).catch(()=>{}); tg.HapticFeedback.notificationOccurred('success'); };

window.openMyRefs = async () => {
  tg.HapticFeedback.impactOccurred('light');
  document.getElementById('modalRefs').classList.add('open');
  try {
    const r = await fetch('/api/my-referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    const list = await r.json();
    let h = '';
    list.forEach(u => { h += '<div style="padding:10px;border-bottom:1px solid #333;">' + u.firstName + ' - ' + (u.totalAdsWatched||0) + ' просм.</div>'; });
    document.getElementById('bodyRefs').innerHTML = h || 'Пусто';
  } catch(e) {}
};

window.openRating = () => { tg.HapticFeedback.impactOccurred('light'); document.getElementById('modalRating').classList.add('open'); loadRating('balance'); };

window.loadRating = async (type) => {
  document.getElementById('tgBal').classList.toggle('on', type === 'balance');
  document.getElementById('tgRef').classList.toggle('on', type === 'referrals');
  try {
    const r = await fetch('/api/rating?type=' + type);
    const list = await r.json();
    let h = '';
    list.forEach((u, i) => { h += '<div class="r-row"><div class="r-pos">#'+(i+1)+'</div><div class="r-name">'+u.firstName+'</div><div class="r-val">'+(type==='balance'?(u.balance/10000).toFixed(4):u.referrals)+'</div></div>'; });
    document.getElementById('ratingList').innerHTML = h;
  } catch(e) {}
};

window.closeModal = (id) => { tg.HapticFeedback.impactOccurred('light'); document.getElementById(id).classList.remove('open'); };
window.bgClose = (id, e) => { if (e.target === document.getElementById(id)) closeModal(id); };

// ADMIN PANEL
const ADMIN_ID = '7020322752';
const isAdminUser = userId === ADMIN_ID;
if (isAdminUser) document.getElementById('nav-admin').style.display = 'flex';

async function loadManualTasks() {
  try {
    const r = await fetch('/api/tasks');
    const list = await r.json();
    let h = '';
    list.forEach(t => { h += '<div class="glass card">' + t.title + '<br>+' + (t.reward/10000) + ' TON<button onclick="claimTask('+t.id+')">Выполнено</button></div>'; });
    document.getElementById('manualTasksList').innerHTML = h || 'Нет заданий';
  } catch(e) {}
}

window.claimTask = async (taskId) => {
  const r = await fetch('/api/tasks/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, taskId }) });
  const d = await r.json();
  tg.showAlert(d.success ? 'Заявка отправлена!' : (d.error || 'Ошибка'));
};
loadManualTasks();

if (isAdminUser) {
  window.adminLoadWithdrawals = async () => {
    const r = await fetch('/api/admin/withdrawals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminId: userId }) });
    const list = await r.json();
    let h = '';
    list.forEach(w => { h += '<div class="glass card">'+w.firstName+' ('+(w.amount/10000)+' TON) '+w.status+'<br><button onclick="adminWithdrawAction('+w.id+',\'approve\')">✅</button><button onclick="adminWithdrawAction('+w.id+',\'reject\')">❌</button></div>'; });
    document.getElementById('adminWithdrawals').innerHTML = h || 'Пусто';
  };
  window.adminWithdrawAction = async (id, action) => { await fetch('/api/admin/withdraw-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminId: userId, withdrawId: id, action }) }); adminLoadWithdrawals(); };
  
  const origGoTab = window.goTab;
  window.goTab = (tabId, navId) => { origGoTab(tabId, navId); if (tabId === 'tabAdmin') adminLoadWithdrawals(); };
}

syncData();
</script>
</body>
</html>`;

    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};
