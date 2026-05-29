export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

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

    if (pathname === "/api/reward" && request.method === "POST") {
      const { userId } = await request.json();
      const u = await env.DB.prepare("SELECT * FROM users WHERE userId = ?").bind(userId).first();
      const newCount = (u.totalAdsWatched || 0) + 1;
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET balance = balance + 10, totalAdsWatched = totalAdsWatched + 1 WHERE userId = ?").bind(userId),
        env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'")
      ]);
      if (u.referredBy && newCount >= 15) {
        await env.DB.prepare("UPDATE users SET balance = balance + 1 WHERE userId = ?").bind(u.referredBy).run();
      }
      if (newCount === 15 && u.referredBy) {
        await env.DB.prepare("UPDATE users SET balance = balance + 100 WHERE userId = ?").bind(userId).run();
      }
      return new Response(JSON.stringify({ success: true, adsWatched: newCount }), { headers: { "Content-Type": "application/json" } });
    }

    if (pathname === "/api/task-reward" && request.method === "POST") {
      const { userId } = await request.json();
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET balance = balance + 5 WHERE userId = ?").bind(userId),
        env.DB.prepare("UPDATE stats SET views = views + 1 WHERE id = 'global'")
      ]);
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (pathname === "/api/rating") {
      const type = new URL(request.url).searchParams.get('type') || 'balance';
      const orderField = type === 'referrals' ? 'referrals' : 'balance';
      const { results } = await env.DB.prepare(`SELECT firstName, balance, referrals FROM users ORDER BY ${orderField} DESC LIMIT 20`).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    if (pathname === "/api/my-referrals" && request.method === "POST") {
      const { userId } = await request.json();
      const { results } = await env.DB.prepare(
        "SELECT firstName, username, totalAdsWatched FROM users WHERE referredBy = ? ORDER BY totalAdsWatched DESC"
      ).bind(userId).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Lume</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --glass: rgba(255,255,255,0.08);
      --glass-border: rgba(255,255,255,0.15);
      --glass-hover: rgba(255,255,255,0.13);
      --glass-strong: rgba(255,255,255,0.12);
      --blur: blur(24px) saturate(180%);
      --blur-sm: blur(16px) saturate(160%);
      --text: #ffffff;
      --text-dim: rgba(255,255,255,0.5);
      --text-mid: rgba(255,255,255,0.75);
      --accent: #5eb4ff;
      --accent2: #a78bfa;
      --gold: #fbbf24;
      --success: #34d399;
      --r: 20px;
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    
    html, body {
      height: 100%; width: 100%;
      font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif;
      background: #0a0a0f;
      color: var(--text);
      overflow: hidden;
    }

    /* === MESH BACKGROUND === */
    .bg-mesh {
      position: fixed; inset: 0; z-index: 0;
      background:
        radial-gradient(ellipse 80% 60% at 20% 10%, rgba(94,180,255,0.18) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 20%, rgba(167,139,250,0.15) 0%, transparent 55%),
        radial-gradient(ellipse 70% 40% at 50% 80%, rgba(94,180,255,0.1) 0%, transparent 50%),
        radial-gradient(ellipse 50% 60% at 10% 70%, rgba(167,139,250,0.08) 0%, transparent 50%),
        #0a0a0f;
      animation: meshShift 12s ease-in-out infinite alternate;
    }
    @keyframes meshShift {
      0%   { filter: hue-rotate(0deg) brightness(1); }
      100% { filter: hue-rotate(15deg) brightness(1.05); }
    }
    .bg-noise {
      position: fixed; inset: 0; z-index: 1; pointer-events: none;
      opacity: 0.025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-size: 200px 200px;
    }

    /* === LAYOUT === */
    .app { position: relative; z-index: 2; height: 100vh; display: flex; flex-direction: column; }
    .scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 16px 110px; scrollbar-width: none; }
    .scroll-area::-webkit-scrollbar { display: none; }
    .tab { display: none; animation: tabIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
    .tab.active { display: block; }
    @keyframes tabIn { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }

    /* === GLASS CARD === */
    .glass {
      background: var(--glass);
      backdrop-filter: var(--blur);
      -webkit-backdrop-filter: var(--blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--r);
      position: relative;
      overflow: hidden;
    }
    .glass::before {
      content:'';
      position:absolute; top:0; left:0; right:0; height:1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    }
    .card { padding: 20px; margin-bottom: 14px; }

    /* === HEADER STRIP === */
    .header-strip {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px 0;
      position: relative; z-index: 2;
    }
    .header-user { display: flex; align-items: center; gap: 12px; }
    .avatar {
      width: 42px; height: 42px; border-radius: 12px;
      background: linear-gradient(135deg, rgba(94,180,255,0.3), rgba(167,139,250,0.3));
      border: 1px solid var(--glass-border);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 17px; color: var(--text);
      backdrop-filter: var(--blur-sm);
    }
    .header-name { font-size: 15px; font-weight: 700; color: var(--text); }
    .header-id { font-size: 11px; color: var(--text-dim); margin-top: 1px; }
    .header-bal {
      text-align: right;
    }
    .header-bal-val { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: var(--text); }
    .header-bal-label { font-size: 10px; color: var(--text-dim); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }

    /* === BALANCE CARD === */
    .bal-card { padding: 28px 24px; text-align: center; margin-bottom: 14px; }
    .bal-label { font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
    .bal-num {
      font-size: 58px; font-weight: 800; letter-spacing: -3px; color: var(--text);
      background: linear-gradient(135deg, #fff 30%, rgba(94,180,255,0.9));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .bal-currency { font-size: 14px; font-weight: 700; color: var(--accent); letter-spacing: 3px; margin-top: 4px; opacity: 0.85; }
    .progress-wrap { margin-top: 22px; }
    .progress-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); font-weight: 600; margin-bottom: 8px; }
    .progress-track { height: 5px; background: rgba(255,255,255,0.1); border-radius: 99px; overflow: hidden; }
    .progress-fill {
      height: 100%; width: 0%; border-radius: 99px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      transition: width 1s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 0 12px rgba(94,180,255,0.6);
    }
    .views-line { font-size: 11px; color: var(--text-dim); text-align: right; margin-top: 6px; }

    /* === BUTTONS === */
    .btn-main {
      width: 100%; padding: 18px; border-radius: 16px; border: none; cursor: pointer;
      font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.2px;
      background: linear-gradient(135deg, rgba(94,180,255,0.35), rgba(167,139,250,0.35));
      backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm);
      border: 1px solid rgba(94,180,255,0.35);
      display: flex; align-items: center; justify-content: center; gap: 10px;
      transition: all 0.2s; position: relative; overflow: hidden;
    }
    .btn-main::after {
      content:''; position:absolute; inset:0;
      background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
      opacity: 0; transition: opacity 0.2s;
    }
    .btn-main:active { transform: scale(0.97); opacity: 0.85; }
    .btn-main:active::after { opacity: 1; }
    .btn-ghost {
      width: 100%; padding: 16px; border-radius: 14px; border: 1px solid var(--glass-border);
      background: var(--glass); backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm);
      color: var(--text-mid); font-size: 14px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      transition: all 0.2s; margin-top: 10px;
    }
    .btn-ghost:active { background: var(--glass-hover); transform: scale(0.98); }

    /* === SECTION HEADING === */
    .sec-title { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 6px; letter-spacing: -0.5px; }
    .sec-sub { font-size: 13px; color: var(--text-dim); line-height: 1.6; margin-bottom: 20px; }

    /* === REFERRAL BLOCK === */
    .ref-divider { height: 1px; background: var(--glass-border); margin: 28px 0 24px; }
    .ref-highlight {
      padding: 18px 20px; border-radius: 16px; margin-bottom: 14px;
      background: linear-gradient(135deg, rgba(94,180,255,0.1), rgba(167,139,250,0.1));
      border: 1px solid rgba(94,180,255,0.2);
      backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm);
    }
    .ref-highlight-title { font-size: 16px; font-weight: 800; margin-bottom: 8px; color: var(--text); }
    .ref-highlight-desc { font-size: 13px; color: var(--text-mid); line-height: 1.65; }
    .ref-highlight-desc b { color: var(--accent); }
    .ref-link-row {
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border);
      border-radius: 13px; padding: 13px 16px; margin-bottom: 12px;
    }
    .ref-link-text { flex: 1; font-size: 12px; color: var(--text-dim); font-family: 'SF Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .copy-btn {
      background: rgba(94,180,255,0.2); border: 1px solid rgba(94,180,255,0.3);
      border-radius: 8px; padding: 7px 12px; color: var(--accent); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.2s;
    }
    .copy-btn:active { opacity: 0.7; }
    .ref-count-badge {
      display: inline-flex; align-items: center;
      background: rgba(94,180,255,0.15); border: 1px solid rgba(94,180,255,0.25);
      border-radius: 8px; padding: 3px 10px; font-size: 12px; font-weight: 700; color: var(--accent); margin-left: 8px;
    }

    /* === TASKS === */
    .task-card {
      padding: 22px 20px; margin-bottom: 14px;
      background: linear-gradient(135deg, rgba(167,139,250,0.1), rgba(94,180,255,0.08));
      border: 1px solid rgba(167,139,250,0.2);
      border-radius: 18px;
      backdrop-filter: var(--blur-sm); -webkit-backdrop-filter: var(--blur-sm);
    }
    .task-reward-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.25);
      border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 800; color: var(--success);
      margin-bottom: 14px;
    }
    .task-title { font-size: 17px; font-weight: 800; margin-bottom: 8px; }
    .task-desc { font-size: 13px; color: var(--text-mid); line-height: 1.65; margin-bottom: 18px; }
    .task-note {
      font-size: 11.5px; color: var(--text-dim); line-height: 1.6; margin-top: 14px;
      padding: 12px 14px; background: rgba(255,255,255,0.04); border-radius: 10px;
      border-left: 2px solid rgba(94,180,255,0.4);
    }

    /* === PROFILE === */
    .prof-hero {
      display: flex; align-items: center; gap: 16px; padding: 22px 20px; margin-bottom: 14px;
    }
    .prof-avatar {
      width: 64px; height: 64px; border-radius: 18px; flex-shrink: 0;
      background: linear-gradient(135deg, rgba(94,180,255,0.35), rgba(167,139,250,0.35));
      border: 1px solid rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; font-weight: 800; color: var(--text);
    }
    .prof-name { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .prof-id { font-size: 12px; color: var(--text-dim); }
    .stat-row { display: flex; align-items: center; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .stat-row:last-child { border-bottom: none; padding-bottom: 0; }
    .stat-label { flex: 1; font-size: 14px; color: var(--text-dim); }
    .stat-val { font-size: 15px; font-weight: 800; color: var(--text); }
    .trophy-row {
      display: flex; align-items: center; gap: 14px; padding: 18px 20px; cursor: pointer; transition: all 0.2s;
    }
    .trophy-row:active { opacity: 0.8; }
    .trophy-icon-wrap {
      width: 44px; height: 44px; border-radius: 13px; flex-shrink: 0;
      background: linear-gradient(135deg, rgba(251,191,36,0.25), rgba(251,191,36,0.1));
      border: 1px solid rgba(251,191,36,0.3);
      display: flex; align-items: center; justify-content: center;
    }
    .trophy-texts .t1 { font-size: 15px; font-weight: 700; }
    .trophy-texts .t2 { font-size: 12px; color: var(--text-dim); margin-top: 2px; }

    /* === INFO === */
    .info-card { padding: 22px; margin-bottom: 14px; }
    .info-title { font-size: 16px; font-weight: 800; margin-bottom: 10px; }
    .info-text { font-size: 13px; color: var(--text-dim); line-height: 1.7; }

    /* === MODAL === */
    .modal-bg {
      position: fixed; inset: 0; z-index: 300;
      background: rgba(0,0,0,0.65);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      display: none; align-items: flex-end;
    }
    .modal-bg.open { display: flex; }
    .modal-sheet {
      width: 100%; max-height: 82vh;
      background: rgba(16,16,24,0.92);
      backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
      border: 1px solid var(--glass-border);
      border-radius: 24px 24px 0 0;
      display: flex; flex-direction: column;
      animation: sheetUp 0.3s cubic-bezier(0.34,1.4,0.64,1);
    }
    @keyframes sheetUp { from { transform: translateY(40px); opacity:0; } to { transform: translateY(0); opacity:1; } }
    .modal-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.2); margin: 12px auto 0; }
    .modal-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px 14px; border-bottom: 1px solid var(--glass-border);
    }
    .modal-head h3 { font-size: 17px; font-weight: 800; }
    .modal-x {
      width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.1);
      border: none; color: var(--text-dim); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .modal-body { overflow-y: auto; padding: 16px 20px 30px; flex: 1; scrollbar-width: none; }
    .modal-body::-webkit-scrollbar { display: none; }
    .toggle-row { display: flex; gap: 8px; margin-bottom: 18px; }
    .tgl {
      flex: 1; padding: 11px; border-radius: 11px; font-size: 13px; font-weight: 700;
      color: var(--text-dim); background: rgba(255,255,255,0.05); border: 1px solid transparent;
      cursor: pointer; transition: all 0.2s; text-align: center;
    }
    .tgl.on { background: rgba(94,180,255,0.18); border-color: rgba(94,180,255,0.3); color: var(--accent); }
    .r-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .r-row:last-child { border-bottom: none; }
    .r-pos { width: 32px; text-align: center; font-size: 15px; font-weight: 800; color: var(--text-dim); }
    .r-name { flex: 1; font-size: 14px; font-weight: 600; }
    .r-val { font-size: 13px; font-weight: 800; color: var(--accent); }
    .ref-item-m { display: flex; align-items: center; gap: 13px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .ref-item-m:last-child { border-bottom: none; }
    .ref-av-m { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .ref-prog-wrap { flex: 1; min-width: 0; }
    .ref-prog-name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ref-prog-bar { height: 3px; background: rgba(255,255,255,0.1); border-radius: 99px; margin-top: 7px; overflow: hidden; }
    .ref-prog-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
    .ref-prog-num { font-size: 10px; color: var(--text-dim); margin-top: 3px; }
    .badge-done { font-size: 10px; font-weight: 700; color: var(--success); text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-wait { font-size: 10px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }

    /* === NAV DOCK === */
    .nav-dock {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
      padding: 0 12px 20px; padding-bottom: max(20px, env(safe-area-inset-bottom));
    }
    .nav-inner {
      background: rgba(18,18,30,0.75);
      backdrop-filter: blur(28px) saturate(200%); -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 26px;
      display: flex; justify-content: space-around; align-items: center;
      padding: 10px 8px 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .nav-item {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
      color: rgba(255,255,255,0.35); cursor: pointer; transition: all 0.25s; padding: 4px 0;
      position: relative;
    }
    .nav-item svg { width: 22px; height: 22px; transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
    .nav-item span { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; transition: all 0.25s; }
    .nav-item.active { color: var(--text); }
    .nav-item.active svg { transform: translateY(-2px) scale(1.1); filter: drop-shadow(0 0 6px rgba(94,180,255,0.6)); }
    .nav-item.active span { color: var(--accent); }
    .nav-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); position: absolute; bottom: -2px; opacity: 0; transition: opacity 0.25s; box-shadow: 0 0 6px var(--accent); }
    .nav-item.active .nav-dot { opacity: 1; }

    /* === SPINNER === */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 0.8s linear infinite; display: inline-block; }

    /* === PULSE ANIMATION for watch button === */
    @keyframes pulse-ring {
      0% { transform: scale(1); opacity: 0.5; }
      100% { transform: scale(1.15); opacity: 0; }
    }
    .pulse-wrap { position: relative; }
    .pulse-ring {
      position: absolute; inset: 0; border-radius: 16px;
      border: 2px solid rgba(94,180,255,0.5);
      animation: pulse-ring 2s ease-out infinite;
      pointer-events: none;
    }
  </style>
</head>
<body>
<div class="bg-mesh"></div>
<div class="bg-noise"></div>

<div class="app">
  <!-- HEADER -->
  <div class="header-strip">
    <div class="header-user">
      <div class="avatar" id="avHead">L</div>
      <div>
        <div class="header-name" id="nameHead">Загрузка...</div>
        <div class="header-id" id="idHead">ID: —</div>
      </div>
    </div>
    <div class="header-bal">
      <div class="header-bal-val" id="balHead">0</div>
      <div class="header-bal-label">Lume</div>
    </div>
  </div>

  <!-- SCROLL AREA -->
  <div class="scroll-area">

    <!-- TAB: ADS -->
    <div id="tabAds" class="tab active">
      <div class="glass bal-card">
        <div class="bal-label">Текущий баланс</div>
        <div class="bal-num" id="balMain">0</div>
        <div class="bal-currency">LUME</div>
        <div class="progress-wrap">
          <div class="progress-labels">
            <span>Цель: 100 000</span>
            <span id="pctMain">0%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" id="fillMain"></div></div>
          <div class="views-line">Всего просмотров: <strong id="viewsMain" style="color:var(--text);">0</strong></div>
        </div>
      </div>

      <div class="pulse-wrap">
        <div class="pulse-ring"></div>
        <button class="btn-main" id="btnWatch">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <polygon points="5,3 19,12 5,21" fill="currentColor"/>
          </svg>
          Инициировать просмотр
        </button>
      </div>

      <p style="text-align:center; font-size:12px; color:var(--text-dim); margin-top:18px; line-height:1.65; padding: 0 8px;">
        Система монетизации внимания. Каждый просмотренный материал конвертируется во внутренний актив платформы.
      </p>

      <!-- REFERRAL -->
      <div class="ref-divider"></div>

      <div class="ref-highlight">
        <div class="ref-highlight-title">Приглашай друзей</div>
        <div class="ref-highlight-desc">
          Получай <b>+100 Lume</b> за каждого друга и <b>10%</b> от их заработка.<br>
          Реферал засчитывается после просмотра 15 рекламных роликов.
        </div>
      </div>

      <div class="ref-link-row glass">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink:0; opacity:0.5;">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="ref-link-text" id="refLinkBox">Загрузка...</div>
        <button class="copy-btn" onclick="copyRef()">Копировать</button>
      </div>

      <button class="btn-main" onclick="shareRef()">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="2"/>
          <circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
          <circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="2"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" stroke-width="2"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" stroke-width="2"/>
        </svg>
        Пригласить друга
      </button>
      <button class="btn-ghost" onclick="openMyRefs()">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Мои рефералы
        <span class="ref-count-badge" id="refBadge">0</span>
      </button>
    </div>

    <!-- TAB: TASKS -->
    <div id="tabTasks" class="tab">
      <div class="sec-title">Задания</div>
      <div class="sec-sub">Выполняй задания и пополняй баланс</div>

      <div class="task-card glass">
        <div class="task-reward-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
          </svg>
          +5 очков к общей цели
        </div>
        <div class="task-title">Партнёрские задания</div>
        <div class="task-desc">
          Выполняй задания по кнопке ниже и получай сразу <strong style="color:var(--success);">+5 очков</strong> к общей цели сообщества — помогай платформе расти быстрее.
        </div>
        <button class="btn-main" id="btnTask">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <polyline points="20,6 9,17 4,12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Выполнять
        </button>
        <div class="task-note">
          <strong style="color:var(--text-mid);">Важно:</strong> необходимо нажимать на эту ссылку, а там уже подписываться на каналы или переходить на сайты. Только так выполнение засчитывается!
        </div>
      </div>
    </div>

    <!-- TAB: PROFILE -->
    <div id="tabProfile" class="tab">
      <div class="sec-title">Профиль</div>
      <div class="sec-sub">Статистика вашего аккаунта</div>

      <div class="glass prof-hero">
        <div class="prof-avatar" id="avProf">L</div>
        <div>
          <div class="prof-name" id="nameProf">User</div>
          <div class="prof-id" id="idProf">ID: —</div>
        </div>
      </div>

      <div class="glass card">
        <div class="stat-row">
          <div class="stat-label">Активный капитал</div>
          <div class="stat-val" id="profBal">0 LUME</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">Просмотров рекламы</div>
          <div class="stat-val" id="profAds">0</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">Рефералов</div>
          <div class="stat-val" id="profRefs">0</div>
        </div>
      </div>

      <div class="glass" style="margin-bottom:14px; border-radius:var(--r); overflow:hidden;" onclick="openRating()">
        <div class="trophy-row">
          <div class="trophy-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M8 21h8M12 17v4M17 3H7l1 7c0 2.21 1.79 4 4 4s4-1.79 4-4l1-7z" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M17 4h2a2 2 0 011.92 2.56L19 11M7 4H5a2 2 0 00-1.92 2.56L5 11" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="trophy-texts">
            <div class="t1">Глобальный рейтинг</div>
            <div class="t2">Позиции лучших участников</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="margin-left:auto; color:var(--text-dim);">
            <polyline points="9,18 15,12 9,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <button class="btn-ghost" style="border-color:rgba(255,255,255,0.08); color:var(--text-dim);" onclick="alert('Модуль вывода средств заблокирован до официального релиза платформы.')">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <rect x="1" y="4" width="22" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
          <line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" stroke-width="2"/>
        </svg>
        Запросить вывод средств
      </button>
    </div>

    <!-- TAB: INFO -->
    <div id="tabInfo" class="tab">
      <div class="sec-title">О проекте</div>
      <div class="sec-sub">Официальная информация и связь с разработчиками</div>

      <div class="glass info-card">
        <div class="info-title">Архитектура LUME</div>
        <div class="info-text">
          Мы создаём прозрачную экономическую модель. Рекламодатели инвестируют во внимание аудитории, а пользователи получают прямую долю дохода за взаимодействие с контентом. Средства аккумулируются и распределяются алгоритмически.
        </div>
      </div>

      <div class="glass info-card">
        <div class="info-title">Стратегия</div>
        <div class="info-text">
          Стратегическая цель платформы — выпуск утилитарного токена и его листинг на децентрализованных площадках. Накопление баллов на текущем этапе обеспечит максимальное преимущество при конвертации.
        </div>
      </div>

      <button class="btn-main" onclick="tg.openTelegramLink('https://t.me/')" style="margin-bottom:10px;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <polygon points="22,2 15,22 11,13 2,9" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
        </svg>
        Новостной канал
      </button>
      <button class="btn-ghost" onclick="tg.openTelegramLink('https://t.me/lume_project_support')">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Служба поддержки
      </button>
    </div>

  </div><!-- /scroll-area -->

  <!-- NAVIGATION -->
  <div class="nav-dock">
    <div class="nav-inner">

      <div class="nav-item active" id="nav-ads" onclick="goTab('tabAds','nav-ads')">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/>
          <polygon points="10,9 16,12 10,15" fill="currentColor"/>
        </svg>
        <span>Реклама</span>
        <div class="nav-dot"></div>
      </div>

      <div class="nav-item" id="nav-tasks" onclick="goTab('tabTasks','nav-tasks')">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8"/>
          <polyline points="8,12 10.5,14.5 16,9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Задания</span>
        <div class="nav-dot"></div>
      </div>

      <div class="nav-item" id="nav-profile" onclick="goTab('tabProfile','nav-profile')">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
          <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>Профиль</span>
        <div class="nav-dot"></div>
      </div>

      <div class="nav-item" id="nav-info" onclick="goTab('tabInfo','nav-info')">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
          <line x1="12" y1="8" x2="12" y2="8.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <line x1="12" y1="11" x2="12" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>Инфо</span>
        <div class="nav-dot"></div>
      </div>

    </div>
  </div>
</div>

<!-- MODAL: MY REFERRALS -->
<div class="modal-bg" id="modalRefs" onclick="bgClose('modalRefs',event)">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-head">
      <h3>Мои рефералы</h3>
      <button class="modal-x" onclick="closeModal('modalRefs')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="modal-body" id="bodyRefs">
      <div style="text-align:center;padding:40px;color:var(--text-dim);">
        <svg class="spin" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31" stroke-dashoffset="10"/></svg>
      </div>
    </div>
  </div>
</div>

<!-- MODAL: RATING -->
<div class="modal-bg" id="modalRating" onclick="bgClose('modalRating',event)">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-head">
      <h3 style="display:flex;align-items:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 21h8M12 17v4M17 3H7l1 7c0 2.21 1.79 4 4 4s4-1.79 4-4l1-7z" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 4h2a2 2 0 011.92 2.56L19 11M7 4H5a2 2 0 00-1.92 2.56L5 11" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/></svg>
        Рейтинг
      </h3>
      <button class="modal-x" onclick="closeModal('modalRating')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="toggle-row">
        <div class="tgl on" id="tgBal" onclick="loadRating('balance')">По капиталу</div>
        <div class="tgl" id="tgRef" onclick="loadRating('referrals')">По рефералам</div>
      </div>
      <div id="ratingList">
        <div style="text-align:center;padding:30px;color:var(--text-dim);">
          <svg class="spin" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31" stroke-dashoffset="10"/></svg>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const tg = window.Telegram.WebApp;
tg.expand();
tg.setHeaderColor && tg.setHeaderColor('#0a0a0f');
tg.setBackgroundColor && tg.setBackgroundColor('#0a0a0f');

const user = tg.initDataUnsafe?.user || { id: '123456', first_name: 'Пользователь', username: 'guest' };
const userId = user.id.toString();
const botUsername = 'lume_project_bot'; // Без @
const startParam = tg.initDataUnsafe?.start_param || null;

// Ref URL — startapp формат
const refUrl = 'https://t.me/' + botUsername + '/app?startapp=' + userId;

async function syncData() {
  try {
    const r = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, firstName: user.first_name, username: user.username, refBy: startParam })
    });
    const d = await r.json();
    const u = d.user;
    const s = d.stats;

    const bal = u.balance.toLocaleString();
    const refs = u.referrals || 0;
    const ads = u.totalAdsWatched || 0;
    const ini = u.firstName.charAt(0).toUpperCase();

    document.getElementById('balMain').textContent = u.balance.toLocaleString();
    document.getElementById('balHead').textContent = bal;
    document.getElementById('profBal').textContent = bal + ' LUME';
    document.getElementById('profAds').textContent = ads;
    document.getElementById('profRefs').textContent = refs;
    document.getElementById('refBadge').textContent = refs;

    ['avHead','avProf'].forEach(id => document.getElementById(id).textContent = ini);
    ['nameHead','nameProf'].forEach(id => document.getElementById(id).textContent = u.firstName);
    ['idHead','idProf'].forEach(id => document.getElementById(id).textContent = 'ID: ' + userId);

    const p = Math.min((s.views / 100000) * 100, 100);
    document.getElementById('pctMain').textContent = p.toFixed(1) + '%';
    document.getElementById('fillMain').style.width = p + '%';
    document.getElementById('viewsMain').textContent = s.views.toLocaleString();

    document.getElementById('refLinkBox').textContent = refUrl;
  } catch(e) { console.error(e); }
}

// Watch ad
const Ads = window.Adsgram.init({ blockId: "24601" });
document.getElementById('btnWatch').onclick = async () => {
  tg.HapticFeedback.impactOccurred('medium');
  try {
    await Ads.show();
    const r = await fetch('/api/reward', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const d = await r.json();
    tg.HapticFeedback.notificationOccurred('success');
    if (d.adsWatched === 15) tg.showAlert('Вы получили 100 Lume как реферальный бонус!');
    syncData();
  } catch(e) { tg.HapticFeedback.notificationOccurred('error'); }
};

// Task button
document.getElementById('btnTask').onclick = async () => {
  tg.HapticFeedback.impactOccurred('medium');
  tg.openTelegramLink('https://t.me/linknibot/app?startapp=x_lkfh');
  try {
    await fetch('/api/task-reward', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    tg.HapticFeedback.notificationOccurred('success');
    syncData();
  } catch(e) {}
};

// Navigation
window.goTab = (tabId, navId) => {
  tg.HapticFeedback.impactOccurred('light');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.getElementById(navId).classList.add('active');
};

// Referral
window.shareRef = () => {
  tg.HapticFeedback.impactOccurred('light');
  const text = 'Присоединяйся к LUME — зарабатывай за просмотр рекламы!';
  tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(refUrl) + '&text=' + encodeURIComponent(text));
};
window.copyRef = () => {
  navigator.clipboard.writeText(refUrl).catch(() => {});
  tg.HapticFeedback.notificationOccurred('success');
  const btn = document.querySelector('.copy-btn');
  btn.textContent = 'Скопировано!';
  setTimeout(() => btn.textContent = 'Копировать', 2000);
};

// My referrals modal
window.openMyRefs = async () => {
  tg.HapticFeedback.impactOccurred('light');
  document.getElementById('modalRefs').classList.add('open');
  document.getElementById('bodyRefs').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);"><svg class="spin" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31" stroke-dashoffset="10"/></svg></div>';
  try {
    const r = await fetch('/api/my-referrals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const list = await r.json();
    if (!list.length) {
      document.getElementById('bodyRefs').innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-dim);font-size:14px;line-height:1.7;">У вас пока нет рефералов.<br>Поделитесь ссылкой, чтобы начать зарабатывать.</div>';
      return;
    }
    let h = '<div style="font-size:11.5px;color:var(--text-dim);margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:2px solid rgba(94,180,255,0.4);">Реферал засчитывается после 15 просмотров рекламы</div>';
    list.forEach(u => {
      const prog = Math.min(u.totalAdsWatched || 0, 15);
      const done = prog >= 15;
      h += \`<div class="ref-item-m">
        <div class="ref-av-m">\${u.firstName.charAt(0).toUpperCase()}</div>
        <div class="ref-prog-wrap">
          <div class="ref-prog-name">\${u.firstName}\${u.username ? ' <span style="color:var(--text-dim);font-size:11px;">@'+u.username+'</span>' : ''}</div>
          <div class="ref-prog-bar"><div class="ref-prog-fill" style="width:\${(prog/15)*100}%;"></div></div>
          <div class="ref-prog-num">\${prog}/15 просмотров</div>
        </div>
        <div>\${done ? '<div class="badge-done">Засчитан</div>' : '<div class="badge-wait">В процессе</div>'}</div>
      </div>\`;
    });
    document.getElementById('bodyRefs').innerHTML = h;
  } catch(e) {}
};

// Rating modal
window.openRating = () => {
  tg.HapticFeedback.impactOccurred('light');
  document.getElementById('modalRating').classList.add('open');
  loadRating('balance');
};
window.loadRating = async (type) => {
  tg.HapticFeedback.selectionChanged();
  document.getElementById('tgBal').classList.toggle('on', type === 'balance');
  document.getElementById('tgRef').classList.toggle('on', type === 'referrals');
  document.getElementById('ratingList').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);"><svg class="spin" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31" stroke-dashoffset="10"/></svg></div>';
  try {
    const r = await fetch('/api/rating?type=' + type);
    const list = await r.json();
    const medals = ['', '🥇', '🥈', '🥉'];
    let h = '';
    list.forEach((u, i) => {
      const val = type === 'balance' ? u.balance.toLocaleString() + ' L' : (u.referrals || 0) + ' реф.';
      const pos = i < 3
        ? \`<div class="r-pos" style="font-size:18px;">\${medals[i+1]}</div>\`
        : \`<div class="r-pos" style="color:var(--text-dim);">#\${i+1}</div>\`;
      h += \`<div class="r-row">\${pos}<div class="r-name">\${u.firstName}</div><div class="r-val">\${val}</div></div>\`;
    });
    document.getElementById('ratingList').innerHTML = h || '<div style="text-align:center;padding:20px;color:var(--text-dim);">Нет данных</div>';
  } catch(e) {}
};

// Modal close
window.closeModal = (id) => {
  tg.HapticFeedback.impactOccurred('light');
  document.getElementById(id).classList.remove('open');
};
window.bgClose = (id, e) => {
  if (e.target === document.getElementById(id)) closeModal(id);
};

syncData();
</script>
</body>
</html>`;

    return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
  }
};
