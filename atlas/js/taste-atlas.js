const $atlas = id => document.getElementById(id);
const graphPoints = [[19,21],[50,21],[81,21],[19,79],[50,79],[81,79]];
const rasaPoints = [[50,13],[80,30],[80,70],[50,87],[20,70],[20,30]];
const worldById = new Map(tasteAtlas.world.map(item => [item.id, item]));

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function control(text, action, style = 'chip') {
  const button = element('button', text, style);
  button.type = 'button';
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', action);
  return button;
}

function mark(button, active) {
  button.setAttribute('aria-pressed', String(active));
}

function sourceLinks(ids) {
  const box = element('div', '', 'atlas-sources');
  for (const id of ids) {
    const [label, url] = tasteAtlas.sources[id];
    const link = element('a', '↗ ' + label, 'atlas-source');
    link.href = url;
    box.append(link);
  }
  return box;
}

function renderReadout(root, {tag, title, sample, text, cue, sources, steps}) {
  root.replaceChildren(element('div', tag, 'atlas-kicker'), element('h2', title));
  if (sample) root.append(element('b', sample));
  if (steps) root.append(steps);
  root.append(element('p', text), element('p', cue, 'atlas-cue'), sourceLinks(sources));
}

function svgNode(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

const nodeArt = {
  base: 'M4 11h16c0 6-4 9-8 9s-8-3-8-9ZM6 9c2-2 4-2 6 0m1-2c2-2 4-2 6 0',
  water: 'M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12Zm-3 12c0 2 1 3 3 4',
  fat: 'M9 3h6v4l-1 1v3l3 3v7H7v-7l3-3V8L9 7Zm0 14h6',
  heat: 'M12 3c4 5 7 8 7 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 3 1 4 2 4s2-3 1-9Z',
  time: 'M6 3h12m-12 18h12M7 3v4c0 2 5 5 5 5s5-3 5-5V3M7 21v-4c0-2 5-5 5-5s5 3 5 5v4',
  finish: 'M12 3v18M3 12h18M5.5 5.5l13 13m0-13-13 13',
  sweet: 'M3 13c4-4 14-4 18 0-4 4-14 4-18 0Zm9-5c0-3 2-4 5-5',
  sour: 'M5 17 18 4c5 5 4 10-1 14-5 3-9 3-12-1Zm0 0 13-7m-10 8 7-5',
  salty: 'm12 3 9 9-9 9-9-9 9-9Zm0 0v18M3 12h18',
  pungent: 'm13 3-7 10h6l-1 8 7-11h-6l1-7Z',
  bitter: 'M5 19c-1-9 5-14 14-14 0 9-5 14-14 14Zm-2 2L16 8m-8 7v-4m3 1h5',
  astringent: 'M3 4c5 4 7 8 9 8s4-4 9-8M3 20c5-4 7-8 9-8s4 4 9 8M5 12h14',
};

function graphIcon(id) {
  const icon = svgNode('svg', {viewBox:'0 0 24 24', class:'taste-icon', 'aria-hidden':'true'});
  icon.append(svgNode('path', {d:nodeArt[id]}));
  return icon;
}

function setupGraph(root, items, points, coreTitle, coreLabel, onSelect, ring = false) {
  const svg = svgNode('svg', {viewBox:'0 0 600 400', preserveAspectRatio:'none', 'aria-hidden':'true'});
  if (ring) {
    svg.append(svgNode('ellipse', {cx:300, cy:200, rx:180, ry:148, class:'graph-ring'}));
  }
  root.append(svg);
  const core = element('div', coreTitle, 'atlas-core');
  core.style.setProperty('--x', '50%');
  core.style.setProperty('--y', '50%');
  core.append(element('small', coreLabel));
  root.append(core);

  return items.map((item, i) => {
    const [x, y] = points[i];
    const line = svgNode('line', {x1:300, y1:200, x2:x*6, y2:y*4, class:'graph-spoke'});
    svg.append(line);
    const button = control('', () => onSelect(i), 'taste-node');
    button.style.setProperty('--x', x + '%');
    button.style.setProperty('--y', y + '%');
    button.append(graphIcon(item.id), element('strong', item.title), element('small', item.sub));
    root.append(button);
    return {id:item.id, button, line};
  });
}

function paintGraph(graph, active, route = []) {
  for (const {id, button, line} of graph) {
    mark(button, active === id);
    button.classList.toggle('route', route.includes(id));
    line.classList.toggle('route', route.includes(id));
    line.classList.toggle('current', active === id);
  }
}

function player(button, idleLabel, getLength, onStep) {
  let timer = null;
  const stop = () => {
    window.clearTimeout(timer);
    timer = null;
    button.textContent = idleLabel;
    mark(button, false);
  };
  button.addEventListener('click', () => {
    if (timer !== null) return stop();
    const length = getLength();
    button.textContent = '□ остановить';
    mark(button, true);
    function step(index) {
      if (index === length) return stop();
      onStep(index);
      timer = window.setTimeout(() => step(index + 1), 1500);
    }
    step(0);
  });
  return stop;
}

let routeIndex = 0;
const routes = tasteAtlas.routes;
const nodes = tasteAtlas.nodes;
const routeGraph = setupGraph($atlas('route-graph'), nodes, graphPoints, 'вкус', '06 ОПЕРАЦИЙ', i => {
  stopRoute();
  renderRoute(i);
});
const routeButtons = routes.map((route, i) => control(route.label, () => {
  stopRoute();
  routeIndex = i;
  history.replaceState(null,'','#systems/'+route.id);
  renderRoute();
}));
routeButtons[routes.findIndex(route => route.id === 'vasilisa-couscous')].classList.add('vasilisa-tab');
$atlas('route-choices').append(...routeButtons);

function renderRoute(nodeIndex = -1) {
  const route = routes[routeIndex];
  const node = nodes[nodeIndex];
  paintGraph(routeGraph, node?.id, route.order);
  routeButtons.forEach((button, i) => mark(button, i === routeIndex));
  const steps = element('ol', '', 'atlas-steps');
  route.order.forEach((id, i) => {
    const title = nodes.find(item => item.id === id).title;
    steps.append(element('li', (i + 1) + ' ' + title, id === node?.id ? 'current' : ''));
  });
  const readout = $atlas('route-detail');
  renderReadout(readout, {
    tag: node ? 'операция ' + String(nodeIndex + 1).padStart(2, '0') : 'маршрут 0' + (routeIndex + 1),
    title: node?.title ?? route.name,
    text: node?.text ?? route.text,
    cue: node?.cue ?? route.cue,
    sources: node?.sources ?? route.sources,
    steps,
  });
  const links = element('div','','atlas-choice');
  links.append(internalLink('#dish/'+route.id,'сценарий · аудио · журнал →'));
  if (worldById.has(route.id)) links.append(internalLink('#library/'+route.id,'культура →'));
  readout.append(links);
}

const stopRoute = player($atlas('route-play'), '▷ проиграть маршрут',
  () => routes[routeIndex].order.length,
  i => renderRoute(nodes.findIndex(item => item.id === routes[routeIndex].order[i])));
renderRoute();

const rasaGraph = setupGraph($atlas('rasa-graph'), tasteAtlas.rasas, rasaPoints, 'rasa', '06 ОЩУЩЕНИЙ', i => {
  stopRasa();
  renderRasa(i);
}, true);

function renderRasa(i) {
  const item = tasteAtlas.rasas[i];
  paintGraph(rasaGraph, item.id);
  renderReadout($atlas('rasa-detail'), {...item, tag: 'rasa / 0' + (i + 1) + ' · ' + item.sub});
  renderRasaGuide(item);
}

const stopRasa = player($atlas('rasa-play'), '▷ пройти шесть rasa', () => tasteAtlas.rasas.length, renderRasa);
renderRasa(0);

function setupLab(key, items) {
  function select(index) {
    buttons.forEach((button, i) => mark(button, i === index));
    const item = items[index];
    renderReadout($atlas(key + '-detail'), {...item, tag: item.sub});
  }
  const buttons = items.map((item, i) => control('0' + (i + 1) + ' · ' + item.title, () => select(i)));
  $atlas(key + '-choices').append(...buttons);
  select(0);
}
setupLab('water', tasteAtlas.water);
setupLab('spice', tasteAtlas.spice);

for (const [term, title, prompt] of tasteAtlas.factors) {
  const item = element('li');
  item.append(element('small', term), element('b', title), element('span', prompt));
  $atlas('factors').append(item);
}



function renderRasaGuide(item) {
  const guide = tasteAtlas.rasaGuide[item.id];
  const box = $atlas('rasa-guide');
  box.replaceChildren(element('div', 'ПРИПРАВА / МОМЕНТ / ПРОБА', 'atlas-kicker'),
    element('h2', guide.seasoning), element('p', guide.use), element('p', guide.trial, 'atlas-cue'));
  const links = element('div', '', 'atlas-choice');
  for (const id of guide.cultures) {
    const link = element('a', '↗ ' + worldById.get(id).dish, 'chip');
    link.href = '#library/' + id;
    links.append(link);
  }
  box.append(links);
  if (item.id === 'astringent') box.append(sourceLinks(['tea','astringency','pomegranate']));
  if (item.id === 'pungent') box.append(sourceLinks(['trigeminal','sanshool']));
}

const metaphorPaths = {
  grains:'M20 43h80l-8 17c-8 13-54 13-63 0zM25 42c3-14 14-21 35-21s32 7 35 21M39 32l6 2m10-8 5 3m11 4 6 2m-25 2 4 2m13 0 3-2M46 17q-7-6 0-12m15 12q-7-6 0-12m15 12q-7-6 0-12',
  mortar:'M17 37h71c-4 17-15 25-35 25S21 54 17 37zM23 38c3-7 13-10 22-11m16 1c10 0 17 4 22 10m-35-5 28-21c5-4 10 2 6 7L65 33M42 65h25',
  bread:'M20 48c0-13 6-20 14-22 6-13 24-18 40-13 17 4 29 16 29 28v8c-8 11-27 17-48 16-16 0-29-4-35-9zM20 48c12 10 53 14 83-7M37 32l9 11m7-17 10 12m8-14 10 10M26 21l8-6',
  pan:'M15 47c0-10 16-18 36-18s36 8 36 18-16 18-36 18-36-8-36-18Zm0 0v8c0 10 16 18 36 18s36-8 36-18v-8m0 0 20-10c7-3 9 2 4 5L87 56M37 23q-6-8 0-14m14 14q-6-8 0-14m14 14q-6-8 0-14',
  walnut:'M59 16c-13-10-30 3-32 19-6 6-3 16 2 20 3 12 19 17 30 9 12 9 31 2 32-10 7-7 7-17 1-23-4-16-20-24-33-15Zm0 0c-8 10 8 16 0 26s5 16 0 22m-8-34c-7-6-15 2-14 8m14 9c-9-5-14 3-10 8m27-26c9-7 16 3 12 8m-12 11c8-4 13 3 10 8',
  waves:'M14 40c0-6 20-10 45-10s45 4 45 10-20 10-45 10-45-4-45-10zm0 0c4 15 17 26 45 26s41-11 45-26M23 43q9-6 18 0t18 0 18 0 18 0M39 25q-5-9 1-16m19 15q-5-9 1-16m19 16q-5-9 1-16',
  tofu:'m20 41 22-13 21 13-22 14zM20 41v18l21 13 22-13V41m-22 14v17m14-38 22-13 21 13-22 14zM76 48v15l22-13V34m-45-8 12-8 12 7M18 71c18 7 60 10 86-2',
  jar:'M38 20h44v7l-3 4 8 13v22c0 7-54 7-54 0V44l8-13-3-4zM39 27h43M34 48q7-4 14 0t14 0 14 0 10 0M48 57q10-5 23 0m-20 6 11-2m12-4 5 3M43 17h35',
  bowl:'M16 37c0-8 20-15 44-15s44 7 44 15-20 15-44 15-44-7-44-15Zm0 0 10 20c12 20 55 20 68 0l10-20M35 40c11-10 37-12 51-2m-40 2c9-5 22-6 29-3m-19 4 9-1',
  tagine:'M14 52h92c-3 14-19 19-46 19s-44-5-46-19Zm9 0c20-13 28-27 34-35h6c7 11 17 23 34 35M56 17v-5h9v5m-33 27h56m-48-6h41',
  fishpot:'M21 43h78v15c-3 11-73 11-78 0zm0 4-11 2v5h11m78-7 11 2v5H99M35 32c13-14 36-14 47 0-13 9-32 10-47 0zm0 0-12-8v15zM70 30h2M49 14q9-5 18 0',
  chile:'M30 65c18-7 30-23 32-36 2-11 11-13 18-9 9 5 9 16 2 26-9 15-28 23-52 19Zm43-47c-1-7 5-11 11-10m-27 43c9-5 14-12 16-20m-46 11c6-7 10-8 15-6m38 20 11-4',
  coconut:'M21 43c0-11 17-20 38-20 23 0 40 9 40 20S82 63 59 63c-21 0-38-9-38-20Zm9 0c0-7 13-13 29-13s31 6 31 13-14 12-31 12-29-5-29-12Zm-9 0c-2 16 14 27 39 29 23 0 42-12 39-29M43 16l5-9m12 7 5-9m10 10 5-9',
  plate:'M13 43c0-14 21-24 47-24s47 10 47 24-21 24-47 24-47-10-47-24Zm11 0c0-9 16-17 36-17s36 8 36 17-16 17-36 17-36-8-36-17Zm16-4 12-8 10 12-13 7zm23-1c9-8 22-4 24 4-5 10-17 10-24-4z',
};

function metaphor(art, caption) {
  const frame = element('figure', '', 'library-figure');
  const svg = svgNode('svg', {viewBox:'0 0 120 84', 'aria-hidden':'true'});
  svg.append(svgNode('path', {d:'M9 11h14M9 11v13m88-13h14v13m0 35v14H97M9 59v14h14', class:'metaphor-guide'}));
  svg.append(svgNode('path', {d:metaphorPaths[art], class:'metaphor-ink', pathLength:1}));
  frame.append(svg, element('figcaption', caption));
  return frame;
}

function selectOption(label, value) {
  const option = element('option', label);
  option.value = value;
  return option;
}

function normalized(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('ru').trim();
}

const libraryControls = {
  query: $atlas('library-query'),
  zone: $atlas('library-zone'),
  rasa: $atlas('library-rasa'),
};
let libraryId = tasteAtlas.world[0].id;
let libraryStage = 0;
let libraryTab = 'context';
const libraryIndex = $atlas('library-index');
const libraryDetail = $atlas('library-detail');
const rasaNames = new Map(tasteAtlas.rasas.map(item => [item.id, item.title]));
for (const zone of new Set(tasteAtlas.world.map(item => item.zone))) {
  libraryControls.zone.append(selectOption(zone, zone));
}
for (const [id, name] of rasaNames) libraryControls.rasa.append(selectOption(name, id));

function renderLibrary(focusId = '') {
  const {query, zone, rasa} = libraryControls;
  const search = normalized(query.value);
  const filtered = tasteAtlas.world.filter(item => {
    const profile = tasteAtlas.cultures[item.id];
    return (!zone.value || item.zone === zone.value) && (!rasa.value || item.rasa.includes(rasa.value)) &&
      normalized([profile.title, profile.principle, profile.grammar, item.dish, item.region, ...item.pantry].join(' ')).includes(search);
  });
  $atlas('library-count').textContent = filtered.length + ' / ' + tasteAtlas.world.length + ' ПРОФИЛЕЙ';
  libraryIndex.replaceChildren();
  if (!filtered.length) {
    libraryDetail.replaceChildren(element('p', 'Попробуй название кухни, приёма или блюда.'));
    libraryIndex.append(element('div', 'Совпадений нет', 'library-empty'));
    return;
  }
  if (!filtered.some(item => item.id === libraryId)) {
    libraryId = filtered[0].id;
    libraryStage = 0;
    libraryTab = 'context';
  }
  for (const item of filtered) {
    const button = control('', () => {
      libraryId = item.id;
      libraryStage = 0;
      libraryTab = 'context';
      history.replaceState(null, '', '#library/' + item.id);
      renderLibrary(item.id);
    }, 'library-entry');
    button.dataset.dish = item.id;
    mark(button, libraryId === item.id);
    button.append(element('b', tasteAtlas.cultures[item.id].title), element('small', 'пример · ' + item.dish));
    libraryIndex.append(button);
  }
  if (focusId) libraryIndex.querySelector('[data-dish="' + focusId + '"]')?.focus({preventScroll:true});
  renderCultureProfile(worldById.get(libraryId), libraryTab);
}

function renderCultureExample(item) {
  const number = String(tasteAtlas.world.indexOf(item) + 1).padStart(2,'0');
  const top = element('div', '', 'library-hero');
  const text = element('div');
  text.append(element('h2', item.dish), element('p', item.story));
  top.append(text, metaphor(item.art, 'FIG.C' + number));

  const pantry = element('ul', '', 'library-pantry');
  pantry.append(...item.pantry.map(word => element('li', word)));

  const tags = element('div', '', 'library-tags');
  for (const id of item.rasa) {
    const chip = control(rasaNames.get(id), () => {
      renderRasa(tasteAtlas.rasas.findIndex(rasa => rasa.id === id));
      location.hash = '#ayurveda';
    }, '');
    chip.removeAttribute('aria-pressed');
    tags.append(chip);
  }
  if (!item.rasa.length) tags.append(element('b', 'умами · сенсорный слой'));

  const stages = element('ol', '', 'library-route');
  const step = element('div', '', 'library-step');
  step.setAttribute('aria-live', 'polite');
  const stageButtons = item.route.map(([label], i) => control('0' + (i + 1) + ' · ' + label, () => {
    libraryStage = i;
    updateStage();
  }));
  for (const button of stageButtons) {
    const li = element('li');
    li.append(button);
    stages.append(li);
  }
  function updateStage() {
    stageButtons.forEach((button, i) => mark(button, libraryStage === i));
    step.replaceChildren(element('small', 'ОПЕРАЦИЯ 0' + (libraryStage + 1)), element('p', item.route[libraryStage][1]));
  }
  updateStage();

  const [role, parts] = Object.entries(tasteAtlas.parts).find(([, list]) => list.some(part => part.from === item.id));
  const use = element('button', '＋ в сборщик · ' + composeLabels[role], 'chip');
  use.type = 'button';
  use.addEventListener('click', () => {
    composeControls[role].value = parts.find(part => part.from === item.id).from;
    renderCompose();
    $atlas('legacy-compose').open = true;
    location.hash = '#compose';
  });

  const example = document.createDocumentFragment();
  example.append(element('div', 'C' + number + ' / ' + item.region, 'atlas-kicker'), top,
    pantry, stages, step, tags, use, renderDossier(item));
  return example;
}

function openCulture(id, tab) {
  if (!worldById.has(id)) return;
  if (id !== libraryId || !libraryIndex.querySelector('[data-dish="' + id + '"]')) {
    libraryControls.query.value = '';
    libraryControls.zone.value = '';
    libraryControls.rasa.value = '';
    libraryId = id;
    libraryStage = 0;
  }
  libraryTab = cultureTabs.some(([key]) => key === tab) ? tab : 'context';
  renderLibrary();
}

libraryControls.query.addEventListener('input', () => renderLibrary());
libraryControls.zone.addEventListener('change', () => renderLibrary());
libraryControls.rasa.addEventListener('change', () => renderLibrary());

const composeLabels = {base:'основа',technique:'обработка',finish:'финиш'};
const composeControls = {};
for (const [role, items] of Object.entries(tasteAtlas.parts)) {
  const label = element('label', composeLabels[role]);
  const select = element('select');
  select.id = 'part-' + role;
  for (const part of items) select.append(selectOption(part.title,part.from));
  label.append(select);
  $atlas('compose-parts').append(label);
  composeControls[role] = select;
  select.addEventListener('change', renderCompose);
}
composeControls.technique.value = 'fond';
composeControls.finish.value = 'chermoula';

const composeModes = [
  {id:'meat', title:'мясо + жир', inputs:'2 куриных бедра с кожей и масло для жарки по необходимости.',
    action:'Приготовь куриные бёдра отдельно, доведи в центре до 74 °C. Оставь хрустящую кожу. Если выбрал соус из прижарок, сохрани коричневые прижарки со сковороды.'},
  {id:'plant', title:'растительная', inputs:'180 г вёшенок и 1 ст. л. масла.',
    action:'Подрумянь вёшенки порциями на масле. Для сборки проверь бульон, даси, кимчи и моле. Бери растительные версии, а сливочное масло меняй на растительное.'},
  {id:'tasting', title:'две ложки', inputs:'Две маленькие порции готовой основы.',
    action:'Первую ложку оставь контрольной, на второй проверь одну выбранную добавку. Сравни прежде, чем вмешивать остальные.'},
];
let composeMode = 'meat';
const modeButtons = composeModes.map(mode => control(mode.title, () => {
  composeMode = mode.id;
  renderCompose();
}));
$atlas('compose-modes').append(...modeButtons);

function renderCompose() {
  const [base, technique, finish] = Object.entries(tasteAtlas.parts).map(([role, list]) =>
    list.find(part => part.from === composeControls[role].value));
  const mode = composeModes.find(item => item.id === composeMode);
  modeButtons.forEach((button, i) => mark(button, composeModes[i].id === composeMode));
  const tasting = mode.id === 'tasting';
  const title = base.title + ' / ' + finish.title.toLocaleLowerCase('ru');
  const annotated = [base, technique, finish];
  const prep = [base, mode, technique, finish];
  const ordered = element('ol', '', 'compose-recipe-list');
  for (const part of prep) {
    const li = element('li');
    const region = worldById.get(part.from)?.region;
    li.append(element('b', part.title), element('small', region ?? 'ВАРИАНТ FOODOS'),
      element('p', part.action), element('small', part.inputs));
    ordered.append(li);
  }
  const sources = [...new Set(annotated.map(part => worldById.get(part.from).sources[0]))];
  if (mode.id === 'meat') sources.push('safety');
  $atlas('compose-recipe').replaceChildren(element('div', 'ПРОБА FOODOS · ' + mode.title, 'atlas-kicker'),
    element('h2', title), metaphor('plate', 'FIG.MIX'), ordered,
    element('p', 'Сравни две ложки, меняя только один параметр. Дозы рассчитаны на пробу перед смешиванием всей тарелки.', 'atlas-cue'), sourceLinks(sources));
  const sourceLine = annotated.map(part => worldById.get(part.from).dish + ' – ' + part.title).join(' · ');
  const inputs = tasting ? 'Две маленькие порции. Масштабируй предложенные количества по вкусу.' : 'Две порции.';
  $atlas('compose-prompt').value = [
    'Домашняя проба FoodOS. ' + inputs + ' Вариант: ' + mode.title + '.',
    'Происхождение операций: ' + sourceLine + '.',
    'Ингредиенты по этапам: ' + prep.map(part => part.inputs).join(' · ') + '.',
    'Порядок: ' + prep.map((part, i) => (i + 1) + '. ' + part.action).join(' '),
    'Собери короткий трекер. Сохрани указанные жиры и выбранную дорожку. Не меняй цель A/B: одна добавка за раз.',
  ].join('\n');
  $atlas('compose-status').textContent = '';
}

$atlas('compose-copy').addEventListener('click', async () => {
  const field = $atlas('compose-prompt');
  const status = $atlas('compose-status');
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = 'Текст скопирован';
  } catch {
    field.focus();
    field.select();
    status.textContent = document.execCommand('copy') ? 'Текст скопирован' : 'Текст выделен. Скопируй его.';
  }
});

renderLibrary();
renderCompose();

Object.assign(nodeArt, {
  hydrate: nodeArt.water,
  extract: 'M5 4h14l-3 8-4 3v5m-3 0h6m-9-9h12',
  discard: 'M4 6h16l-6 8v5l-4 2v-7zM16 19h5m-2-2 2 2-2 2',
  carry: 'M3 12c3-5 6-5 9 0s6 5 9 0M3 17c3-5 6-5 9 0s6 5 9 0',
  simmer: nodeArt.heat,
  reduce: 'M4 19h16M6 15h12M8 10l4-5 4 5m-4-5v8',
});

let waterLens = '';
let waterIndex = 0;
const waterBranch = setupGraph($atlas('water-graph'), tasteAtlas.waterMap, graphPoints, 'вода', '06 ОПЕРАЦИЙ', i => {
  stopWater();
  renderWaterBranch(i);
});

function renderWaterBranch(i) {
  waterIndex = i;
  const operation = tasteAtlas.waterMap[i];
  const related = waterLens ? tasteAtlas.waterMap.filter(item => item.links.includes(waterLens)).map(item => item.id) : [];
  paintGraph(waterBranch, operation.id, related);
  const root = $atlas('water-branch-detail');
  renderReadout(root, {...operation, tag:'операция ' + String(i + 1).padStart(2,'0')});
  const examples = element('div', '', 'atlas-choice');
  for (const id of operation.examples) {
    const link = element('a', worldById.get(id).dish + ' ↗', 'chip');
    link.href = '#library/' + id;
    examples.append(link);
  }
  root.append(element('b', 'Связи · ' + operation.links.join(' · ')), examples);
}

const stopWater = player($atlas('water-play'), '▷ пройти ветку', () => tasteAtlas.waterMap.length, renderWaterBranch);
const waterLenses = ['','жар','жир','время','вкус','текстура','соль'];
const waterButtons = waterLenses.map(lens => control(lens || 'все связи', () => {
  waterLens = lens;
  waterButtons.forEach((button, i) => mark(button, waterLenses[i] === lens));
  renderWaterBranch(waterIndex);
}));
mark(waterButtons[0], true);
$atlas('water-lenses').append(...waterButtons);
renderWaterBranch(0);
for (const meal of tasteAtlas.waterMeals) {
  const box = element('div', '', 'atlas-readout');
  const link = element('a', 'открыть трекер ↗', 'chip');
  link.href = 'cook.html?meal=' + meal.slug;
  box.append(element('div', meal.operation, 'atlas-kicker'), element('h2', meal.name),
    element('p', meal.summary), link, internalLink('#dish/'+meal.slug,'сценарий и журнал →'),sourceLinks([meal.source]));
  $atlas('water-meals').append(box);
}

renderAyurvedaBridges();
renderAyurvedaChapters();
renderOperationIndex();
const atlasPages = ['systems','ayurveda','library','compose','water','compare','map','experiments','dish'];
let activeAtlasPage;
function setPage() {
  stopRoute();
  stopRasa();
  stopWater();
  const [requested, key, subsection] = location.hash.slice(1).split('/');
  const current = atlasPages.includes(requested) ? requested : 'systems';
  const vasilisa = current === 'dish' && key === 'vasilisa-couscous';
  for (const id of atlasPages) {
    $atlas('page-' + id).hidden = id !== current;
    if (id === current && !vasilisa) $atlas('nav-' + id).setAttribute('aria-current', 'page');
    else $atlas('nav-' + id).removeAttribute('aria-current');
  }
  if (vasilisa) $atlas('nav-vasilisa').setAttribute('aria-current','page');
  else $atlas('nav-vasilisa').removeAttribute('aria-current');
  if (current === 'library' && key) openCulture(key, subsection);
  if (current === 'systems') {
    routeIndex = Math.max(0,routes.findIndex(route => route.id === key));
    renderRoute();
  }
  if (current === 'compare') openComparison(key);
  if (current === 'ayurveda' && key) {
    openAyurvedaChapter(key);
    requestAnimationFrame(() => $atlas('ayurveda-chapter').scrollIntoView({block:'start'}));
  }
  if (current === 'compose') openAlchemy(key, subsection);
  if (current === 'map') openAtlasMap(key, subsection);
  if (current === 'experiments') openFieldLab(key);
  const keepReading = activeAtlasPage === current && ['library','ayurveda','compose'].includes(current);
  activeAtlasPage = current;
  return keepReading;
}
window.addEventListener('hashchange', () => {
  if (!setPage()) window.scrollTo(0, 0);
});
setPage();
