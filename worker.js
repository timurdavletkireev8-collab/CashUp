// worker.js - Серверная часть Cloudflare Worker
import htmlTemplate from './src/frontend.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // ==================== API ====================
    
    // 1. Регистрация / получение пользователя
    if (pathname === "/api/user" && request.method === "POST") {
      const { userId, firstName, username, refBy } = await request.json();
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
      const user = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
      const stats = await env.DB.prepare("SELECT views FROM stats WHERE id = 'global'").bind().first();
      return new Response(JSON.stringify({ user, stats }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. Награда за рекламу
    if (pathname === "/api/reward" && request.method === "POST") {
      const { userId } = await request.json();
      const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
      const newCount = (u.totalAdsWatched || 0) + 1;
      const earnAmount = 10;
      const refBonus = Math.floor(earnAmount * 0.1);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET balance = balance + ?, totalAdsWatched = totalAdsWatched + 1 WHERE userId = ?").bind(earnAmount, userId),
        env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'")
      ]);
      if (u.referredBy && refBonus > 0) {
        await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(refBonus, u.referredBy).run();
      }
      if (newCount === 15 && u.referredBy) {
        await env.DB.prepare("UPDATE users SET balance = balance + 100 WHERE userId = ?").bind(userId).run();
      }
      return new Response(JSON.stringify({ success: true, adsWatched: newCount }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Награда за задание
    if (pathname === "/api/task-reward" && request.method === "POST") {
      const { userId } = await request.json();
      const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
      const earnAmount = 5;
      const refBonus = Math.floor(earnAmount * 0.1);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(earnAmount, userId),
        env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'")
      ]);
      if (u && u.referredBy && refBonus > 0) {
        await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(refBonus, u.referredBy).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 4. Postback от Giga.pub
    if (pathname === "/api/postback") {
      try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('user');
        const amount = url.searchParams.get('amount');
        const rewardId = url.searchParams.get('rewardId');
        const hash = url.searchParams.get('hash');
        
        console.log(`📨 Postback received: user=${userId}, amount=${amount}, rewardId=${rewardId}`);
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "No user" }), { status: 400 });
        }
        
        const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
        if (!u) {
          return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
        }
        
        const earnAmount = 5;
        const refBonus = Math.floor(earnAmount * 0.1);
        
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(earnAmount, userId),
          env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'")
        ]);
        
        if (u.referredBy && refBonus > 0) {
          await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE userId = ?").bind(refBonus, u.referredBy).run();
        }
        
        console.log(`✅ Reward credited: +${earnAmount} to user ${userId}`);
        
        return new Response(JSON.stringify({ status: "ok" }), { 
          headers: { "Content-Type": "application/json" } 
        });
        
      } catch(e) {
        console.error('Postback error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // 5. Рейтинг
    if (pathname === "/api/rating") {
      const type = new URL(request.url).searchParams.get('type') || 'balance';
      const orderField = type === 'referrals' ? 'referrals' : 'balance';
      const { results } = await env.DB.prepare(`SELECT firstName, balance, referrals FROM users ORDER BY ${orderField} DESC LIMIT 20`).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // 6. Мои рефералы
    if (pathname === "/api/my-referrals" && request.method === "POST") {
      const { userId } = await request.json();
      const { results } = await env.DB.prepare(
        "SELECT firstName, username, totalAdsWatched FROM users WHERE referredBy = ? ORDER BY totalAdsWatched DESC"
      ).bind(userId).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // 7. Вывод средств
    if (pathname === "/api/withdraw" && request.method === "POST") {
      const { userId, wallet, amount } = await request.json();
      const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
      if (!u) return new Response(JSON.stringify({ error: "Пользователь не найден" }), { status: 404 });
      const MIN_WITHDRAW = 5000;
      if ((u.balance || 0) < MIN_WITHDRAW) {
        return new Response(JSON.stringify({ error: "Минимальная сумма вывода — 0.5 TON" }), { status: 400 });
      }
      const amountUnits = Math.floor(amount * 10000);
      if (amountUnits > u.balance) {
        return new Response(JSON.stringify({ error: "Недостаточно средств на балансе" }), { status: 400 });
      }
      await env.DB.prepare("UPDATE users SET balance = balance - ? WHERE userId = ?").bind(amountUnits, userId).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ==================== ВСЁ ОСТАЛЬНОЕ = HTML СТРАНИЦА ====================
    return new Response(htmlTemplate, { 
      headers: { "content-type": "text/html;charset=UTF-8" } 
    });
  }
};
