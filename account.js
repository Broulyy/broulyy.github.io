// Личный кабинет: вход, подписка, привязанный компьютер, смена пароля.
// Общается с сервером лицензий по тому же контракту, что и лаунчер (см. architecture/licensing-api).
(() => {
  // Локально (проверка страниц) ходим в wrangler dev, в бою — на сервер лицензий
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = LOCAL ? 'http://127.0.0.1:8787' : 'https://renegade-api.renegade-internal.workers.dev';
  const TOKEN_KEY = 'renegade.siteToken';

  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const profileView = $('profile-view');

  const token = {
    get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
    set: (v) => { try { localStorage.setItem(TOKEN_KEY, v); } catch { /* приватный режим — живём без запоминания */ } },
    clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { } },
  };

  const say = (el, text, kind = '') => { el.textContent = text; el.className = 'acc-msg' + (kind ? ' ' + kind : ''); };

  // Капча Cloudflare Turnstile. Ключ сайта публичный — он и так виден в разметке страницы.
  // Виджет обычно проходит сам; сервер спрашивает подтверждение только после неудачных попыток входа,
  // поэтому даже при недоступном скрипте обычный вход работает.
  const CAPTCHA_SITE_KEY = '0x4AAAAAAFOkh1PrOnscP9oO';
  let captchaId = null;
  const captcha = {
    render: () => {
      if (captchaId !== null || !window.turnstile || !$('captcha')) return;
      try {
        captchaId = window.turnstile.render('#captcha', { sitekey: CAPTCHA_SITE_KEY, theme: 'dark', language: 'ru' });
      } catch { captchaId = null; }
    },
    token: () => {
      try { return captchaId !== null && window.turnstile ? (window.turnstile.getResponse(captchaId) || '') : ''; } catch { return ''; }
    },
    reset: () => {
      try { if (captchaId !== null && window.turnstile) window.turnstile.reset(captchaId); } catch { }
    },
  };
  // Скрипт Turnstile зовёт эту функцию, когда готов (api.js?render=explicit&onload=rgCaptchaReady)
  window.rgCaptchaReady = () => captcha.render();

  /** Запрос к API. Возвращает { status, body }; сеть недоступна — status 0. */
  async function call(path, { method = 'POST', body, auth } = {}) {
    try {
      const r = await fetch(API + path, {
        method,
        headers: {
          ...(auth ? { authorization: 'Bearer ' + auth } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let j = null;
      try { j = await r.json(); } catch { }
      return { status: r.status, body: j };
    } catch {
      return { status: 0, body: null };
    }
  }

  // Ошибки сервера — короткими человеческими фразами
  const ERRORS = {
    invalid_login: 'Неверный логин или пароль.',
    bad_request: 'Проверь, что всё заполнено верно.',
    too_many_attempts: 'Слишком много попыток входа. Подожди 10 минут.',
    captcha_required: 'Подтверди, что ты человек, и нажми «Войти» ещё раз.',
    captcha_failed: 'Проверка «я не робот» не прошла. Попробуй ещё раз.',
    unauthorized: 'Нужно войти заново.',
    server_error: 'Сервер отвечает ошибкой. Попробуй позже.',
  };
  const errText = (res) => res.status === 0
    ? 'Нет связи с сервером. Проверь интернет.'
    : (ERRORS[res.body?.error] || 'Не получилось (код ' + res.status + ').');

  const dateRu = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    return Number.isNaN(+d) ? iso : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const daysLeft = (until) => {
    if (!until) return null;
    const end = Date.parse(until + 'T00:00:00Z');
    if (Number.isNaN(end)) return null;
    return Math.ceil((end - Date.now()) / 864e5);
  };
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    return b === 1 ? one : many;
  };

  function showLogin(msg) {
    profileView.hidden = true;
    loginView.hidden = false;
    captcha.render();                // форма показана — можно размещать виджет
    if (msg) say($('login-msg'), msg, 'err');
  }

  function render(me) {
    loginView.hidden = true;
    profileView.hidden = false;

    $('hello').textContent = me.login || 'Аккаунт';
    $('sub-line').textContent = me.group && me.group !== 'user' ? 'Группа: ' + me.group : 'Подписка и привязка компьютера';

    const left = daysLeft(me.until);
    $('sub-until').textContent = me.until ? dateRu(me.until) : 'нет подписки';
    if (left === null) $('sub-note').textContent = 'Подписка не оформлена — клиент не запустится.';
    else if (left < 0) $('sub-note').textContent = 'Срок истёк. Продли подписку, чтобы играть.';
    else $('sub-note').textContent = 'Осталось ' + left + ' ' + plural(left, 'день', 'дня', 'дней') + '.';

    const list = $('devices');
    list.innerHTML = '';
    const devices = me.devices || [];
    if (!devices.length) {
      const li = document.createElement('li');
      li.textContent = 'Пока ни один компьютер не привязан — привяжется при первом запуске игры.';
      list.append(li);
    } else {
      for (const d of devices) {
        const li = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = d.hwid + '…';
        li.append(code, document.createTextNode('  ·  привязан ' + dateRu(d.boundAt)));
        list.append(li);
      }
    }

    const btn = $('unbind-btn');
    // Смена компьютера — платная услуга: кнопку не показываем, ведём в поддержку
    btn.hidden = !!me.unbindPaid;
    $('unbind-note').textContent = me.unbindPaid
      ? 'Клиент работает на одном компьютере. Смена компьютера — платная услуга: напиши в поддержку в Discord.'
      : 'Клиент работает на одном компьютере. Сменил ПК — отвяжи прежний.';
    const avail = me.unbindAvailableAt;
    const soon = avail && Date.parse(avail) > Date.now();
    btn.disabled = !devices.length || soon;
    if (!me.unbindPaid && soon) say($('unbind-msg'), 'Следующая отвязка будет доступна ' + dateRu(avail) + '.');
    else say($('unbind-msg'), '');
  }

  async function load() {
    const t = token.get();
    if (!t) return showLogin();
    const res = await call('/api/launcher/me', { method: 'GET', auth: t });
    if (res.status === 200 && res.body) return render(res.body);
    if (res.status === 401) { token.clear(); return showLogin('Вход истёк — войди заново.'); }
    showLogin(errText(res));
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true;
    say($('login-msg'), 'Проверяю…');
    const res = await call('/api/launcher/login', {
      body: { login: $('login').value.trim(), password: $('password').value, captcha: captcha.token() },
    });
    btn.disabled = false;
    captcha.reset();                 // токен виджета одноразовый: для следующей попытки нужен новый
    if (res.status === 200 && res.body?.siteToken) {
      token.set(res.body.siteToken);
      $('password').value = '';
      say($('login-msg'), '');
      return load();
    }
    say($('login-msg'), errText(res), 'err');
  });

  $('unbind-btn').addEventListener('click', async () => {
    if (!confirm('Отвязать компьютер? Следующая отвязка будет доступна только через 30 дней.')) return;
    const btn = $('unbind-btn');
    btn.disabled = true;
    say($('unbind-msg'), 'Отвязываю…');
    const res = await call('/api/launcher/unbind', { auth: token.get() });
    if (res.status === 200) {
      say($('unbind-msg'), 'Компьютер отвязан. Запусти игру на новом — он привяжется сам.', 'ok');
      return load();
    }
    if (res.status === 402) return say($('unbind-msg'), 'Смена компьютера — платная услуга: напиши в поддержку.', 'err');
    if (res.status === 429) {
      say($('unbind-msg'), 'Отвязка будет доступна ' + dateRu(res.body?.availableAt) + '.', 'err');
      return;
    }
    if (res.status === 401) { token.clear(); return showLogin('Вход истёк — войди заново.'); }
    btn.disabled = false;
    say($('unbind-msg'), errText(res), 'err');
  });

  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    say($('pw-msg'), 'Меняю…');
    const res = await call('/api/launcher/password', {
      auth: token.get(),
      body: { oldPassword: $('pw-old').value, newPassword: $('pw-new').value },
    });
    if (res.status === 200) {
      // Сервер гасит все сессии, включая эту — просим войти заново уже с новым паролем
      token.clear();
      $('pw-old').value = $('pw-new').value = '';
      showLogin('Пароль изменён. Войди заново.');
      return;
    }
    if (res.status === 403) return say($('pw-msg'), 'Текущий пароль неверный.', 'err');
    if (res.status === 429) return say($('pw-msg'), 'Слишком много попыток. Подожди 10 минут.', 'err');
    if (res.status === 401) { token.clear(); return showLogin('Вход истёк — войди заново.'); }
    if (res.status === 400) return say($('pw-msg'), 'Новый пароль должен быть не короче 8 символов.', 'err');
    say($('pw-msg'), errText(res), 'err');
  });

  $('logout-btn').addEventListener('click', async () => {
    const t = token.get();
    token.clear();
    if (t) await call('/api/launcher/logout', { auth: t });   // гасим токен и на сервере
    showLogin('Ты вышел из аккаунта.');
  });

  load();
})();
