// Админка подписок. Админ-токен живёт только в sessionStorage — до закрытия вкладки.
// Страница статическая: токен вводит владелец, сервер проверяет его сам (/api/admin/*).
(() => {
  // Локально (проверка страниц) ходим в wrangler dev, в бою — на сервер лицензий
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = LOCAL ? 'http://127.0.0.1:8787' : 'https://renegade-api.renegade-internal.workers.dev';
  const KEY = 'renegade.adminToken';

  const $ = (id) => document.getElementById(id);
  const say = (el, text, kind = '') => { el.textContent = text; el.className = 'acc-msg' + (kind ? ' ' + kind : ''); };

  const admin = {
    get: () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
    set: (v) => { try { sessionStorage.setItem(KEY, v); } catch { } },
    clear: () => { try { sessionStorage.removeItem(KEY); } catch { } },
  };

  async function call(path, body) {
    try {
      const r = await fetch(API + path, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + admin.get(), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      let j = null;
      try { j = await r.json(); } catch { }
      return { status: r.status, body: j };
    } catch {
      return { status: 0, body: null };
    }
  }

  const ERRORS = {
    forbidden: 'Админ-токен не подошёл.',
    bad_request: 'Проверь поля: что-то заполнено неверно.',
    password_required: 'Такого логина ещё нет — задай пароль для нового аккаунта.',
    // Ядро проверяется сразу при загрузке: метку подписчика в негодный архив не вшить
    bad_jar: 'Это не похоже на jar ядра — сервер не смог его разобрать. Проверь файл.',
    server_error: 'Сервер отвечает ошибкой.',
  };
  const errText = (res) => res.status === 0
    ? 'Нет связи с сервером.'
    : (ERRORS[res.body?.error] || 'Не получилось (код ' + res.status + ').');

  const dateRu = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    return Number.isNaN(+d) ? iso : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  function showPanel(on) {
    $('auth-view').hidden = on;
    $('panel-view').hidden = !on;
  }

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    admin.set($('admin-token').value.trim());
    $('admin-token').value = '';
    say($('auth-msg'), 'Проверяю…');
    // Проверяем токен заведомо некорректным запросом: верный токен даст 400 (а не 403),
    // и при этом ничего не меняет в базе
    const res = await call('/api/admin/user', {});
    if (res.status === 403) { admin.clear(); return say($('auth-msg'), ERRORS.forbidden, 'err'); }
    // Только 400 означает «токен принят, не хватает полей». Любой другой ответ (404, 500, нет связи) —
    // это не подтверждение токена, и панель открывать нельзя.
    if (res.status !== 400) return say($('auth-msg'), errText(res), 'err');
    say($('auth-msg'), '');
    showPanel(true);
  });

  $('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { login: $('u-login').value.trim() };
    const pass = $('u-pass').value;
    const group = $('u-group').value.trim();
    const days = $('u-days').value;
    const until = $('u-until').value;
    if (pass) body.password = pass;
    if (group) body.group = group;
    if (until) body.until = until;
    else if (days) body.addDays = Number(days);
    if ($('u-reset').checked) body.resetHwid = true;
    if ($('u-revoke').checked) body.revokeSessions = true;

    say($('user-msg'), 'Применяю…');
    $('user-out').hidden = true;
    const res = await call('/api/admin/user', body);
    if (res.status !== 200) return say($('user-msg'), errText(res), 'err');

    const b = res.body || {};
    const what = b.created ? 'Аккаунт создан' : 'Аккаунт обновлён';
    say($('user-msg'), what + (b.until ? ', подписка до ' + dateRu(b.until) : '') + '.', 'ok');
    $('user-out').hidden = false;
    $('user-out').textContent = JSON.stringify(b, null, 1);
    $('u-pass').value = '';
    $('u-reset').checked = $('u-revoke').checked = false;
  });

  $('ban-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = $('b-login').value.trim();
    if (!confirm('Забрать доступ у «' + login + '»?')) return;
    say($('ban-msg'), 'Применяю…');
    const res = await call('/api/admin/user', { login, until: '2000-01-01', revokeSessions: true });
    if (res.status !== 200) return say($('ban-msg'), errText(res), 'err');
    say($('ban-msg'), 'Доступ забран, все устройства разлогинены.', 'ok');
    $('b-login').value = '';
  });

  $('core-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ver = $('c-ver').value.trim();
    const file = $('c-file').files[0];
    if (!file) return say($('core-msg'), 'Выбери файл ядра.', 'err');
    say($('core-msg'), 'Загружаю ' + Math.round(file.size / 1024) + ' КБ…');
    let res;
    try {
      const r = await fetch(API + '/api/admin/core?version=' + encodeURIComponent(ver), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + admin.get(), 'content-type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
      });
      res = { status: r.status, body: await r.json().catch(() => null) };
    } catch {
      res = { status: 0, body: null };
    }
    if (res.status !== 200) return say($('core-msg'), errText(res), 'err');
    say($('core-msg'), 'Ядро версии ' + (res.body?.version || ver) + ' загружено (' + Math.round((res.body?.size || 0) / 1024) + ' КБ). Версия теперь в персональном режиме.', 'ok');
    $('c-file').value = '';
  });

  $('key-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyHex = $('k-hex').value.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) return say($('key-msg'), 'Ключ — ровно 64 шестнадцатеричных символа.', 'err');
    say($('key-msg'), 'Регистрирую…');
    const res = await call('/api/admin/release-key', { moduleVersion: $('k-ver').value.trim(), keyHex });
    if (res.status !== 200) return say($('key-msg'), errText(res), 'err');
    say($('key-msg'), 'Ключ версии зарегистрирован.', 'ok');
    $('k-hex').value = '';
  });

  $('log-btn').addEventListener('click', async () => {
    say($('log-msg'), 'Загружаю…');
    $('log-list').innerHTML = '';
    let res;
    try {
      const r = await fetch(API + '/api/admin/key-log?limit=100', { headers: { authorization: 'Bearer ' + admin.get() } });
      res = { status: r.status, body: await r.json().catch(() => null) };
    } catch {
      res = { status: 0, body: null };
    }
    if (res.status !== 200) return say($('log-msg'), errText(res), 'err');
    const rows = res.body?.issues || [];
    if (!rows.length) return say($('log-msg'), 'Пока никто не получал ключи.');
    say($('log-msg'), 'Записей: ' + rows.length);
    for (const it of rows) {
      const li = document.createElement('li');
      const who = it.login ? it.login + ' (#' + it.user_id + ')' : '#' + it.user_id;
      li.textContent = who + '  ·  ядро ' + it.module_version + '  ·  ПК ' + it.hwid + '…  ·  ' + dateRu(it.issued_at);
      $('log-list').append(li);
    }
  });

  $('anom-btn').addEventListener('click', async () => {
    say($('anom-msg'), 'Загружаю…');
    $('anom-list').innerHTML = '';
    let res;
    try {
      const r = await fetch(API + '/api/admin/anomalies?minDevices=3', { headers: { authorization: 'Bearer ' + admin.get() } });
      res = { status: r.status, body: await r.json().catch(() => null) };
    } catch {
      res = { status: 0, body: null };
    }
    if (res.status !== 200) return say($('anom-msg'), errText(res), 'err');
    const rows = res.body?.suspects || [];
    if (!rows.length) return say($('anom-msg'), 'Подозрительных аккаунтов нет.');
    say($('anom-msg'), 'Подозрительных: ' + rows.length, 'err');
    for (const it of rows) {
      const li = document.createElement('li');
      const who = it.login ? it.login + ' (#' + it.user_id + ')' : '#' + it.user_id;
      li.textContent = who + '  ·  разных ПК: ' + it.devices + '  ·  выдач: ' + it.issues + '  ·  последняя ' + dateRu(it.last_issue);
      $('anom-list').append(li);
    }
  });

  $('forget-btn').addEventListener('click', () => {
    admin.clear();
    showPanel(false);
    say($('auth-msg'), 'Токен забыт.');
  });

  showPanel(!!admin.get());
})();
