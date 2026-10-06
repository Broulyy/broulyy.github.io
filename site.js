// Общий скрипт сайта Renegade (русская и английская версии, главная и инструкция).
(() => {
const REPO = 'Broulyy/renegade-releases';
const EN = document.documentElement.lang === 'en';
const L = (ru, en) => (EN ? en : ru);
const $ = (s) => document.querySelector(s);

// Шапка с границей при прокрутке
const top = $('#top');
if (top) addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 8), { passive: true });

// Появление при прокрутке
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.rv').forEach((el, i) => { el.style.transitionDelay = (i % 3) * 70 + 'ms'; io.observe(el); });

// Подсветка карточек за курсором
document.querySelectorAll('.card').forEach((c) => c.addEventListener('pointermove', (e) => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}));

// Галерея
const viewer = $('#viewer'), tabs = $('#tabs');
if (viewer && tabs) {
  const SHOTS = [
    ['menu', L('Меню', 'Menu'), L('Меню клиента: категории, настройки, профиль и темы', 'Client menu: categories, settings, profile and themes')],
    ['combat', L('Настройки', 'Settings'), L('Группы настроек, подсказки и бинды', 'Setting groups, hints and keybinds')],
    ['themes', L('Темы', 'Themes'), L('Тема Violet — цвета меняются плавно, без перезапуска', 'Violet theme — colours change smoothly, no restart')],
    ['hud', 'HUD', L('HUD: список функций, эффекты, цель с полоской здоровья', 'HUD: module list, effects, target with a health bar')],
    ['mainmenu', L('Главное меню', 'Main menu'), L('Своё главное меню', 'Custom main menu')],
    ['pause', L('Пауза', 'Pause'), L('Меню паузы в стиле Renegade', 'Renegade-style pause menu')],
    ['loading', L('Загрузка', 'Loading'), L('Свой экран загрузки игры', 'Custom loading screen')],
  ];
  let cur = 0, auto = 0;
  SHOTS.forEach(([f, name, cap], i) => {
    const img = new Image(); img.src = '/img/' + f + '.webp'; img.alt = cap; img.loading = i ? 'lazy' : 'eager'; viewer.appendChild(img);
    const b = document.createElement('button'); b.className = 'tab'; b.textContent = name; b.onclick = () => show(i, true); tabs.appendChild(b);
  });
  function show(i, user) {
    cur = i;
    viewer.querySelectorAll('img').forEach((im, k) => im.classList.toggle('on', k === i));
    tabs.querySelectorAll('.tab').forEach((t, k) => t.classList.toggle('on', k === i));
    $('#cap').textContent = SHOTS[i][2];
    if (user) clearInterval(auto);
  }
  show(0);
  auto = setInterval(() => show((cur + 1) % SHOTS.length), 4500);
  const lb = $('#lb');
  viewer.onclick = () => { lb.querySelector('img').src = '/img/' + SHOTS[cur][0] + '.webp'; lb.classList.add('on'); clearInterval(auto); };
  lb.onclick = () => lb.classList.remove('on');
  addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.classList.remove('on'); });
}

// Выпуски: ссылка на свежий установщик и список изменений
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<b>$1</b>');
const fmtDate = (d) => new Date(d).toLocaleDateString(EN ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
fetch(`https://api.github.com/repos/${REPO}/releases?per_page=15`).then((r) => r.ok ? r.json() : Promise.reject(r.status)).then((list) => {
  list = list.filter((r) => !r.draft && !r.prerelease);
  const setup = list.find((r) => r.assets.some((a) => a.name === 'Renegade-Setup.exe'));
  if (setup) {
    const a = setup.assets.find((x) => x.name === 'Renegade-Setup.exe');
    document.querySelectorAll('.dl').forEach((el) => el.href = a.browser_download_url);
    document.querySelectorAll('.dlmeta').forEach((el) => el.textContent =
      L('Бесплатно', 'Free') + ` · ${setup.tag_name} · ${Math.round(a.size / 1048576)} ${L('МБ', 'MB')} · Windows 10/11`);
  }
  const log = $('#log');
  if (!log) return;
  log.innerHTML = list.slice(0, 5).map((r, i) => {
    const items = (r.body || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[-*•]\s+/.test(l)).map((l) => '<li>' + md(l.replace(/^[-*•]\s+/, '')) + '</li>').join('');
    const title = (r.name || r.tag_name).replace(/^v?[\d.]+\s*[—–:-]?\s*/, '') || r.tag_name;
    return `<article class="rel rv in"><div class="rel-h"><span class="tag">${esc(r.tag_name)}</span>${i === 0 ? `<span class="tag new">${L('Новое', 'New')}</span>` : ''}<h3>${esc(title)}</h3><time>${fmtDate(r.published_at)}</time></div>${items ? '<ul>' + items + '</ul>' : ''}</article>`;
  }).join('') + (EN ? '<p class="cap">Changelogs are written in Russian.</p>' : '') || `<p class="cap">${L('Пока нет выпусков.', 'No releases yet.')}</p>`;
}).catch(() => {
  const log = $('#log');
  if (log) log.innerHTML = `<p class="cap">${L('Не удалось загрузить список — открой «Все выпуски».', 'Could not load the list — open “All releases”.')}</p>`;
});

// Фон: волна из точек (как в лаунчере)
const c = $('#dots');
if (c) {
  const x = c.getContext('2d');
  let w, h, dpr, t = 0, vis = true;
  const fit = () => { dpr = Math.min(devicePixelRatio || 1, 2); w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr; };
  fit(); addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => vis = !document.hidden);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = () => {
    if (vis) {
      x.clearRect(0, 0, w, h);
      const cols = 46, rows = 16, horizon = h * 0.62;
      for (let r = 0; r < rows; r++) {
        const p = r / (rows - 1), y0 = horizon + Math.pow(p, 1.8) * (h - horizon) * 1.05;
        const spread = 0.35 + p * 1.4;
        for (let i = 0; i < cols; i++) {
          const u = (i / (cols - 1) - 0.5) * spread, px = w / 2 + u * w;
          const y = y0 + Math.sin(i * 0.45 + t + r * 0.6) * (3 + p * 14) * dpr;
          const a = (0.12 + p * 0.55) * (1 - Math.abs(u) / (spread * 0.62));
          if (a <= 0 || px < -10 || px > w + 10) continue;
          x.fillStyle = `rgba(201,205,251,${a.toFixed(3)})`;
          x.beginPath(); x.arc(px, y, (0.6 + p * 1.8) * dpr, 0, 6.283); x.fill();
        }
      }
      t += 0.012;
    }
    if (!still) requestAnimationFrame(frame);
  };
  frame();
}
})();
