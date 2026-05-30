# foodos

Кухонная **система** в эстетике **shaper** (B&W technical-manual / patent drawing). Из «одного рецепта» выросла в систему: ввод любого блюда по вкусам → AI собирает трекер, библиотека блюд, камера-распознавание продуктов, растущая библиотека метафор.

**Live:** https://foodos-lula-camarao.netlify.app

## Что умеет

- **ввод любого блюда** — опиши `{context}` («есть фарш и баклажаны, одному без мяса») → `compose.mjs` собирает структуру под твой **вкусовой профиль**: база → точка разделения → дорожки, шаги, таймеры, принципы
- **библиотека блюд** — каждое блюдо = JSON-карточка; `cook.html?meal=slug` рендерит любое
- **камера-распознавание** — `getUserMedia` → «распознать» рисует Shaper-боксы продуктов поверх видео (vision), «проверить готовность» оценивает сковороду. распознавание не даёт инструкций — только идентификация
- **библиотека метафор** — впиши ингредиент → patent line-art (Nano Banana), копится и переиспользуется во всех блюдах
- **две дорожки** — общая база → `⑃` точка разделения → ◆/◇ (море/веган, мясо/веган, …)
- **трекер** — numbered shaper-блоки, инверсия = выполнено, таймеры с зумером/вибрацией, per-step «детальнее (ai)», голос (ru), всё в `localStorage`

## Архитектура

```
index.html  ХАБ (композер · библиотека · вкусы · метафоры)
cook.html   generic ИНСТРУМЕНТ (?meal=slug)
css/shaper.css · js/{store,cook,camera,voice,hub}.js
data/meals/*.json (блюда=данные) · data/taste-profile.default.json
netlify/functions/{draw,advise,compose,recognize}.mjs
```

Полная карта и runbook — [AGENTS.md](AGENTS.md).

**Секреты:** `OPENROUTER_API_KEY` только в Netlify env; браузер ходит к Netlify Function (same-origin прокси), ключ не в репозитории.

## Деплой

push `main` → GitHub Action → `netlify deploy --prod`. Секреты: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` (репо) · `OPENROUTER_API_KEY` (сайт).

---
generated with [Claude Code](https://claude.com/claude-code) · shaper aesthetic · foodos system
