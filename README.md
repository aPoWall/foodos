# foodos

Кухонный инструмент в эстетике **shaper** (B&W technical-manual / patent drawing). Превращает «что в руках» в phone-first трекер готовки с двумя дорожками — морская и растительная — общей базой и точкой разделения.

**Live:** https://foodos-lula-camarao.netlify.app · `fig.01` — *lula recheada com chouriço × camarão* (фаршированный кальмар + креветки, разморозка → стол).

## Что умеет

- **трекер шагов** — numbered shaper-блоки, инверсия = выполнено, прогресс, таймеры с зумером и вибрацией, сохранение в `localStorage`
- **две дорожки** — `⊕ параллель / ◆ море / ◇ веган`, одна база → `⑃` точка разделения соуса
- **камера-монитор** — `getUserMedia` (задняя камера телефона), B&W live preview
- **chef · console** — советы по ходу готовки: текстовый совет по шагу + **«проверить камерой»** (кадр → vision-модель оценивает готовность)
- **живая отрисовка ингредиентов** — впиши ингредиент → patent line-art рисуется на лету через OpenRouter (Nano Banana)
- **голос** — `speechSynthesis` (ru-RU) читает шаги и советы
- **принципы** — кулинарные аксиомы как shaper-readout

## Архитектура

```
index.html        каркас + svg-спрайт ингредиентов
app.css           shaper-токены и компоненты
app.js            движок шагов, камера, голос, таймеры, советы, draw
netlify/functions
  ├─ draw.mjs     OpenRouter image (Nano Banana) → ингредиент line-art
  └─ advise.mjs   OpenRouter text/vision → советы по шагу / по фото
netlify.toml      publish=. · functions=netlify/functions
```

**Секреты:** `OPENROUTER_API_KEY` живёт ТОЛЬКО как Netlify env var. Браузер обращается к Netlify Function (same-origin прокси), ключ наружу не уходит и в git не попадает.

## Локально

```bash
netlify dev    # поднимает статику + функции, подхватывает OPENROUTER_API_KEY
```
Без функций (просто `index.html`) всё работает, кроме live-draw и AI-советов — они деградируют в подсказки.

## Деплой

Push в `main` → GitHub Action (`.github/workflows/deploy.yml`) → `netlify deploy --prod`.
Секреты репозитория: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`. Env сайта: `OPENROUTER_API_KEY`.

---
generated with [Claude Code](https://claude.com/claude-code) · shaper aesthetic · foodos skill
