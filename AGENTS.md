# foodos — кухонная система (agent notes)

Phone-first кухонная система в эстетике **shaper** (B&W technical-manual / patent drawing). Из «одного рецепта» (v2) выросла в **систему** (v3): generic-движок + библиотека блюд + растущая библиотека метафор + камера-распознавание + ввод любого блюда по вкусовому профилю.

**Live:** https://foodos-lula-camarao.netlify.app · **repo:** github.com/aPoWall/foodos (личный, `aPoWall`) · **CI:** push → GitHub Actions → Netlify.

## Карта

```
index.html        ХАБ (fig.00): композер блюда · библиотека · вкусовой профиль · галерея метафор
cook.html         generic ИНСТРУМЕНТ (?meal=slug) — рендерит ЛЮБОЕ блюдо из данных
css/shaper.css    общие shaper-токены (hub + cook)
js/
  store.js        SSOT данных: вкусы, библиотека блюд, метафоры, прогресс, FN() (вызов функций), тема, toast
  cook.js         движок шагов (data-driven), камера, голос, таймеры, draw, per-step AI expand
  camera.js       монитор + COCO→cloud распознавание + рисование боксов поверх видео
  voice.js        ru speechSynthesis
  hub.js          композер · библиотека · профиль · галерея
data/
  meals/<slug>.json   БЛЮДО = ДАННЫЕ (встроенная библиотека)
  meals/index.json    манифест встроенных блюд
  taste-profile.default.json  дефолтный вкусовой профиль (копируется в localStorage, редактируется в хабе)
netlify/functions/
  draw.mjs       ингредиент → patent line-art (Nano Banana google/gemini-2.5-flash-image)
  advise.mjs     совет по шагу / vision-проверка готовности (google/gemini-2.5-flash)
  compose.mjs    {context}+вкусы(+фото) → СТРУКТУРА БЛЮДА (валидный JSON, нормализуется)
  recognize.mjs  кадр камеры → ингредиенты + bounding-боксы (vision)
netlify.toml     publish=. · functions=netlify/functions
.github/workflows/deploy.yml   push main → netlify deploy --prod
```

## Поток данных

- **Блюдо — это JSON** (`data/meals/*.json` или localStorage для пользовательских). `cook.html?meal=slug` грузит его и рендерит. Движок не привязан к рецепту.
- **Новое блюдо:** хаб → композер: `{context}` + вкусовой профиль → `compose.mjs` → meal JSON → `saveUserMeal` (localStorage) → открывается в `cook.html`.
- **Библиотека метафор** общая для всех блюд: нарисованные через `draw.mjs` ингредиенты кешируются в `localStorage['foodos:metaphors']` и переиспользуются (в ingredients блока и в галерее хаба).
- **Камера:** `camera.js` — `getUserMedia(environment)`; «распознать» шлёт кадр в `recognize.mjs` → рисует Shaper-боксы (corner-brackets + выноски a/b/c) поверх видео; «проверить готовность» шлёт кадр в `advise.mjs` (vision). Распознавание НЕ даёт инструкций — только идентификация.

## Схема блюда (meal JSON)

```jsonc
{
  "slug","title","sub","fig","servings","active","total",
  "tracks": { "a":{"label","glyph","key"}, "b":{...} },   // опускается → однодорожечное блюдо
  "ingredients": [ {"id":"squid","label":"кальмар"} ],     // id латиницей для отрисовки/символа
  "axioms": ["кулинарный принцип строчными, можно <b>выделить</b>"],
  "steps": [
    {"id","t":"shared|a|b","ttl","lead","time":сек?,"tip"?},
    {"id":"split","t":"split"}                              // ровно одна, между shared и дорожками
  ]
}
```
`t`: `shared` (⊕) → `split` (⑃) → `a` (◆) / `b` (◇). Дорожки переименовываемы (`море/веган`, `мясо/веган`, `остро/мягко`).

## Секреты (CRITICAL)

`OPENROUTER_API_KEY` живёт **только** как Netlify env var. Браузер → Netlify Function (same-origin прокси `/.netlify/functions/*`) → OpenRouter. **Ключ никогда не в репозитории.** Форма вызова OpenRouter взята из `~/.claude/skills/imagine/imagine.py` (endpoint `…/v1/chat/completions`; image-модель требует `modalities:["image","text"]` + `image_config`; vision — content-часть `{type:"image_url",image_url:{url:dataURL}}`; для JSON-ответов — `response_format:{type:"json_object"}`).

## Deploy runbook (verified, с ловушками)

1. `netlify api createSite --data '{"name":"<n>"}'` (имя занято → авто-имя).
2. **Rename:** `netlify sites:rename` НЕ существует, `netlify api updateSite` молча игнорит. Только прямой `curl -X PATCH https://api.netlify.com/api/v1/sites/<id> -H "Authorization: Bearer $TOK" -d '{"name":"<n>"}'`, затем **перечитать `getSite`** и подтвердить имя.
3. `netlify link --id <id>` → `netlify env:set OPENROUTER_API_KEY "$OPENROUTER_API_KEY"` (без `--site`).
4. `netlify deploy --prod --dir=. --functions=netlify/functions`.
5. CI secrets (`gh secret set`, значение через stdin): `NETLIFY_AUTH_TOKEN` из **`~/Library/Preferences/netlify/config.json`** (`users[].auth.token`, НЕ `~/.config/`) + `NETLIFY_SITE_ID`. В CI workflow — bare `netlify deploy --prod` (пути из `netlify.toml`; `--functions` в CI падает).
6. **Verify реальный URL через `curl`** (страница + 4 функции) ПЕРЕД сдачей. `timeout` на macOS НЕТ — таймаут давать через Bash-tool. Никогда не считать rename/deploy успешным без перечитывания из API.

Текущий site_id: `8ee861cd-0c27-48e4-9a26-0dc6d3efaf5f` · name `foodos-lula-camarao`.

## Локально

`netlify dev` — статика + функции + env. Без функций (просто открыть `index.html`/`cook.html`): трекер/таймеры/голос/локальные метафоры работают; compose/recognize/draw/advise деградируют в сообщения.

## Связь со скиллом

Скилл-генератор: `~/.claude/skills/foodOS/`. Этот репозиторий — развёрнутый инстанс-система; новое блюдо теперь добавляется внутри самого приложения (композер), не требует нового деплоя.
