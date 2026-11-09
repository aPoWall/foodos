import { ingredientDrawing } from './ingredient-art.js?v=1';
import { getMeal, drawMetaphor } from './store.js?v=19';
import { TRADITIONS } from './taste-atlas-traditions.js?v=1';

const roles = {note:'заметка', question:'вопрос', chef:'шеф FoodOS', guide:'подсказка атласа'};
const collator = new Intl.Collator('ru');
let current, catalog, audioManifest, request = 0;

function loadManifest() {
  audioManifest ??= fetch('data/atlas-audio.json').then(response => {
    if (!response.ok) throw Error('Аудиокаталог недоступен.');
    return response.json();
  }).catch(() => {
    audioManifest = null;
    return {};
  });
  return audioManifest;
}

function getCatalog() {
  if (catalog) return catalog;
  catalog = new Map(tasteAtlas.world.map(item => [item.id, {
    id:item.id, culture:item.id, name:item.dish, region:item.region, summary:item.story,
    ingredients:item.pantry.map(label => ({label})),
    steps:item.route.map(([title,text]) => ({title,text})),
    trial:tasteAtlas.dossiers[item.id].trial, sources:item.sources,
  }]));
  for (const dinner of tasteAtlas.fieldDinners) {
    catalog.set(dinner.id,{...dinner, meal:true, summary:dinner.hypothesis, trial:dinner.variable});
  }
  for (const meal of tasteAtlas.waterMeals) {
    catalog.set(meal.slug,{id:meal.slug,culture:meal.source,name:meal.name,summary:meal.summary,
      meal:true,sources:[meal.source],trial:tasteAtlas.dossiers[meal.source].trial});
  }
  return catalog;
}

async function resolveDish(id) {
  const entry = getCatalog().get(id);
  if (entry && !entry.meal) return entry;
  if (!/^[\w-]{1,80}$/.test(id)) return null;
  try {
    const meal = await getMeal(id);
    return {...entry,id,meal:true,name:meal.title,summary:entry?.summary || meal.sub,
      ingredients:meal.ingredients || [],
      steps:(meal.steps || []).filter(step => step.t !== 'split').map(step => ({
        id:step.id, title:step.ttl, text:step.lead, tip:step.tip, time:step.time,
        track:meal.tracks?.[step.t]?.label,
      }))};
  } catch {
    return null;
  }
}

function dishLinks(dish) {
  const actions = element('div','','atlas-choice');
  if (dish.meal) actions.append(internalLink('cook.html?meal='+encodeURIComponent(dish.id),'открыть трекер →'));
  if (dish.culture) {
    actions.append(internalLink('#library/'+dish.culture+'/grammar','грамматика →'));
    const point = dish.point ? dish.id : dish.culture;
    actions.append(internalLink('#map/space/'+point,'вода · жир · время →'));
    if (dish.culture === 'kitchari') actions.append(internalLink('#ayurveda','шесть rasa →'));
  }
  actions.append(internalLink('#experiments'+(knownDinner.has(dish.id) ? '/'+dish.id : ''),'эксперименты →'));
  return actions;
}

function drawIngredient(card, ingredient) {
  const art = element('div','','dish-ingredient-art');
  const drawing = ingredientDrawing(ingredient);
  if (drawing) art.innerHTML = drawing;
  else {
    const button = control('нарисовать',async () => {
      button.disabled = true;
      try {
        let src;
        if (location.protocol === 'https:') {
          const response = await fetch('/.netlify/functions/draw',{
            method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({ingredient:ingredient.label}),signal:AbortSignal.timeout(30000),
          });
          if (!response.ok) throw Error();
          src = (await response.json()).image;
        } else {
          src = await drawMetaphor(ingredient.label);
        }
        if (!/^data:image\//.test(src)) throw Error();
        const image = element('img');
        image.src = src;
        image.alt = ingredient.label;
        art.replaceChildren(image);
      } catch {
        button.textContent = 'повторить рисунок';
        button.disabled = false;
      }
    });
    button.removeAttribute('aria-pressed');
    art.append(button);
  }
  card.append(art,element('figcaption',ingredient.label));
}

function showIngredients(dish) {
  const box = $atlas('dish-ingredients');
  box.replaceChildren();
  for (const ingredient of dish.ingredients) {
    const card = element('figure');
    drawIngredient(card,ingredient);
    box.append(card);
  }
}

function showTraditions(dish) {
  const root = $atlas('dish-traditions');
  const tradition = TRADITIONS[dish.id] ?? TRADITIONS[dish.culture];
  root.replaceChildren();
  if (tradition) {
    if (!TRADITIONS[dish.id]) root.append(element('p','Для этой пробы показана традиция связанного приёма.'));
    const chain = element('ol','','dish-history');
    for (const event of tradition.history) {
      const row = element('li');
      row.append(element('b',event.label),element('p',event.text),
        internalLink(event.url,'↗ источник','atlas-source'));
      chain.append(row);
    }
    root.append(chain,element('p',tradition.boundary,'atlas-cue'));
  } else {
    root.append(element('p','Для этого блюда пока нет проверенной карты традиции.'));
  }
  const links = element('div','','atlas-choice');
  const culture = dish.culture;
  for (const edge of networkLinks.filter(edge => culture && [edge.a,edge.b].includes(culture)).slice(0,4)) {
    const peer = worldById.get(edge.a === culture ? edge.b : edge.a);
    links.append(internalLink('#compare/'+edge.route,'приём · '+peer.dish));
  }
  if (dish.id === 'vasilisa-couscous') {
    links.append(internalLink('#library/chermoula','североафриканская параллель →'),
      internalLink('#compare/tempering','сравнить прогрев специй →'));
  }
  root.append(links);
}

function renderSteps(dish) {
  const list = $atlas('dish-steps');
  const select = $atlas('dish-stage');
  list.replaceChildren();
  select.replaceChildren(selectOption('Блюдо целиком',''));
  dish.steps.forEach((step,index) => {
    const row = element('li');
    row.append(element('b',step.title),element('p',step.text));
    if (step.tip) row.append(element('small',step.tip));
    if (step.track) row.append(element('small','Дорожка · '+step.track));
    row.append(control('запись по шагу',() => {
      select.value = String(index);
      $atlas('dish-message').focus();
    }));
    list.append(row);
    select.append(selectOption((index+1)+' · '+step.title,String(index)));
  });
}

function dishRuns(id) {
  return getFieldLog().filter(item => item.dish === id || (!item.dish && item.dinner === id))
    .sort((a,b) => b.updated.localeCompare(a.updated));
}

function showRun(resetFormat = true) {
  const {dish,runId} = current;
  const runs = dishRuns(dish.id);
  const saved = runs.find(item => item.id === runId);
  const pick = $atlas('dish-run');
  pick.replaceChildren(selectOption('Новая готовка',''),
    ...runs.map(item => selectOption(item.date+' · '+logStages[item.status]+' · '+item.updated.slice(11,16)+' UTC',item.id)));
  pick.value = saved?.id || '';
  if (resetFormat) {
    const format = $atlas('dish-format').elements;
    for (const key of ['baseline','variable','result']) format.namedItem(key).value = saved?.[key] || '';
    format.namedItem('status').value = saved?.status || 'cooking';
    format.namedItem('mapEnabled').checked = !!saved?.map;
    format.namedItem('mapEnabled').disabled = !dish.culture;
  }
  const log = $atlas('dish-messages');
  log.replaceChildren();
  for (const message of saved?.messages || []) {
    const time = new Date(message.at).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
    const row = element('li','','dish-message '+message.role);
    row.append(element('small',[time,roles[message.role],message.stage].filter(Boolean).join(' · ')),
      element('p',message.text));
    log.append(row);
  }
  if (!log.children.length) log.append(element('li','Здесь появятся наблюдения и ответы.'));
  $atlas('dish-log-map').hidden = !saved?.map || saved.status === 'archived';
  $atlas('dish-log-map').href = '#map/space/log-'+(saved?.id || '');
}

function draftEntry() {
  const {dish,runId} = current;
  return {...(dishRuns(dish.id).find(item => item.id === runId) || {
    id:globalThis.crypto?.randomUUID?.() || 'dish-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),
    name:dish.name,date:localDate(),status:'cooking',messages:[],
    dinner:knownDinner.has(dish.id) ? dish.id : '',
  }),dish:dish.id};
}

function saveEntry(entry, resetFormat = true) {
  const saved = writeDishLog(entry);
  if (!saved) {
    $atlas('dish-status').textContent = 'Не удалось сохранить запись. Проверь место в браузере или экспортируй журнал.';
    return null;
  }
  current.runId = saved.id;
  history.replaceState(null,'','#dish/'+current.dish.id+'/'+saved.id);
  showRun(resetFormat);
  return saved;
}

function appendMessage(entry,role,text,stage) {
  return {...entry,messages:[...(entry.messages || []),{role,text,stage,at:new Date().toISOString()}]};
}

async function sendMessage(event) {
  event.preventDefault();
  const input = $atlas('dish-message');
  const text = input.value.trim();
  if (!text || !current) return;
  const {dish} = current;
  const stageValue = $atlas('dish-stage').value;
  const step = stageValue === '' ? null : dish.steps[Number(stageValue)];
  const stage = step?.title || '';
  const ask = event.submitter?.value === 'question';
  const entry = draftEntry();
  const status = $atlas('dish-status');
  if ((entry.messages?.length || 0) >= (ask ? 39 : 40)) {
    status.textContent = 'В этой готовке заполнены 40 сообщений. Выбери «Новая готовка», чтобы продолжить.';
    return;
  }
  const saved = saveEntry(appendMessage(entry,ask ? 'question' : 'note',text,stage),false);
  if (!saved) return;
  input.value = '';
  status.textContent = ask ? 'Шеф разбирает вопрос…' : 'Заметка сохранена.';
  if (!ask) return;
  const button = event.submitter;
  button.disabled = true;
  let role = 'guide';
  let answer = [step?.text || dish.steps[0]?.text,dish.trial].filter(Boolean).join(' ');
  if (location.protocol === 'https:') {
    try {
      const previous = saved.messages.slice(-5,-1).filter(message => ['question','chef'].includes(message.role))
        .map(message => roles[message.role]+': '+message.text.slice(0,120)).join('\n');
      const context = [
        'Вопрос: '+text,'Блюдо: '+dish.name,'Шаг: '+(step?.text || dish.summary || ''),
        'Подскажи практическую проверку. Историю и лечебные эффекты не додумывай.',previous,
      ].join('\n');
      const response = await fetch('/.netlify/functions/advise',{
        method:'POST',headers:{'content-type':'application/json'},
        signal:AbortSignal.timeout(18000),
        body:JSON.stringify({mode:'text',step:stage || dish.name,context}),
      });
      const result = await response.json();
      if (!response.ok || !result.advice) throw Error();
      answer = result.advice;
      role = 'chef';
    } catch {
      // The recorded question stays available if the remote chef is unreachable.
    }
  }
  const latest = dishRuns(dish.id).find(item => item.id === saved.id) || saved;
  const appended = (latest.messages?.length || 0) < 40 && writeDishLog(appendMessage(latest,role,answer || 'Запиши, что изменилось на этом шаге.',stage));
  button.disabled = false;
  if (current?.dish.id === dish.id && current.runId === saved.id) {
    status.textContent = appended ? (role === 'chef' ? 'Ответ сохранён.' : 'Показана подсказка из сценария.') : 'Не удалось сохранить ответ.';
    showRun(false);
  }
}

function saveFormat(event) {
  event.preventDefault();
  if (!current) return;
  const {dish} = current;
  const form = new FormData(event.currentTarget);
  const entry = draftEntry();
  const axis = dish.point?.axis || tasteAtlas.dishMarks[dish.culture]?.axis;
  const map = form.has('mapEnabled') && axis ? entry.map || {culture:dish.culture,axis} : null;
  if (saveEntry({...entry,baseline:form.get('baseline'),variable:form.get('variable'),result:form.get('result'),
    status:form.get('status'),map})) $atlas('dish-status').textContent = 'Формат опыта сохранён в общем журнале.';
}

async function openDish(id,reference) {
  const serial = ++request;
  const audio = $atlas('dish-audio');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  current = null;
  const dish = await resolveDish(id || 'kitchari');
  if (serial !== request || !location.hash.startsWith('#dish')) return;
  const contents = $atlas('dish-contents');
  contents.hidden = !dish;
  if (!dish) {
    $atlas('dish-title').textContent = 'Блюдо не найдено';
    $atlas('dish-summary').textContent = 'Выбери готовый сценарий из списка.';
    return;
  }
  current = {dish,runId:dishRuns(dish.id).find(item => item.id === reference)?.id || dishRuns(dish.id)[0]?.id};
  const picker = $atlas('dish-picker');
  if (!Array.from(picker.options).some(option => option.value === dish.id)) picker.append(selectOption(dish.name,dish.id));
  picker.value = dish.id;
  $atlas('dish-title').textContent = dish.name;
  $atlas('dish-summary').textContent = dish.summary || '';
  $atlas('dish-links').replaceChildren(dishLinks(dish));
  $atlas('dish-trial').textContent = dish.trial || 'Выбери одну переменную и сравни две одинаковые порции.';
  $atlas('dish-status').textContent = '';
  $atlas('dish-message').value = '';
  $atlas('dish-transcript').textContent = '';
  $atlas('dish-audio-note').textContent = 'Загружается сценарий…';
  audio.hidden = true;
  renderSteps(dish);
  if (reference?.startsWith('step-')) {
    const index = dish.steps.findIndex(step => encodeURIComponent(step.id) === reference.slice(5));
    if (index >= 0) $atlas('dish-stage').value = String(index);
  }
  showIngredients(dish);
  showTraditions(dish);
  showRun();
  const manifest = await loadManifest();
  if (serial !== request || !location.hash.startsWith('#dish')) return;
  const recorded = manifest[dish.id];
  const script = recorded?.transcript || [dish.name,...dish.steps.map(step => step.text)].join(' ');
  $atlas('dish-transcript').textContent = script;
  if (recorded) {
    audio.src = recorded.src;
    audio.hidden = false;
    $atlas('dish-audio-note').textContent = 'Русский голос · сценарий по шагам';
  } else {
    $atlas('dish-audio-note').replaceChildren(control('▷ прочитать сценарий',() => {
      if (!('speechSynthesis' in window)) return;
      const reading = new SpeechSynthesisUtterance(script);
      reading.lang = 'ru-RU';
      speechSynthesis.cancel();
      speechSynthesis.speak(reading);
    }));
  }
}

function routeDish() {
  const [page,id,reference] = location.hash.slice(1).split('/');
  if (page === 'dish') openDish(id,reference);
  else {
    ++request;
    $atlas('dish-audio').pause();
    if (current && 'speechSynthesis' in window) speechSynthesis.cancel();
    current = null;
  }
}

window.addEventListener('DOMContentLoaded',() => {
  const picker = $atlas('dish-picker');
  const dishes = [...getCatalog().values()].sort((a,b) => collator.compare(a.name,b.name));
  picker.append(...dishes.map(dish => selectOption(dish.name,dish.id)));
  picker.addEventListener('change',() => {location.hash = '#dish/'+picker.value;});
  $atlas('dish-run').addEventListener('change',event => {
    if (!current) return;
    current.runId = event.currentTarget.value;
    const {dish,runId} = current;
    history.replaceState(null,'','#dish/'+dish.id+(runId ? '/'+runId : ''));
    showRun();
  });
  $atlas('dish-message-form').addEventListener('submit',sendMessage);
  $atlas('dish-format').addEventListener('submit',saveFormat);
  $atlas('dish-format').elements.namedItem('variable').placeholder = 'Одна переменная: момент, доза или ингредиент';
  window.addEventListener('hashchange',routeDish);
  routeDish();
});
