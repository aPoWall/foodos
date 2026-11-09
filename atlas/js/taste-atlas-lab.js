const cultureTabs = [
  ['context','контекст'], ['table','стол'], ['grammar','грамматика'],
  ['variation','варианты'], ['bridge','параллели'], ['example','пример'], ['reading','читать / смотреть'],
];
const alchemyById = new Map(tasteAtlas.alchemy.map(item => [item.id, item]));

function renderCultureProfile(item, tab) {
  const restoreTabFocus = !!document.activeElement?.closest('.culture-tabs');
  const profile = tasteAtlas.cultures[item.id];
  const number = String(tasteAtlas.world.indexOf(item) + 1).padStart(2,'0');
  const hero = element('div', '', 'library-hero');
  const heading = element('div');
  heading.append(element('h2', profile.title), element('p', profile.principle));
  hero.append(heading, metaphor(item.art, 'FIG.C' + number));

  const choices = element('nav', '', 'atlas-choice culture-tabs');
  choices.setAttribute('aria-label','Разделы профиля');
  for (const [id, title] of cultureTabs) {
    const link = internalLink('#library/' + item.id + '/' + id, title);
    if (id === tab) link.setAttribute('aria-current','page');
    choices.append(link);
  }
  const section = element('div', '', 'culture-section');
  section.append(internalLink('#dish/' + item.id, 'сценарий · история · журнал →'));
  if (tab === 'example') {
    section.append(renderCultureExample(item));
    const dinners = tasteAtlas.fieldDinners.filter(dinner=>dinner.culture===item.id);
    if (dinners.length) {
      const choices = element('div','','atlas-choice');
      for (const dinner of dinners) choices.append(internalLink('#experiments/'+dinner.id,dinner.name+' →'));
      section.append(element('h3','Варианты для готовки'),choices);
    }
  }
  else if (tab === 'reading') {
    section.append(element('h3','Гайды, тексты и видео'));
    for (const [format,id,description] of tasteAtlas.readingShelf[item.id]) {
      const reading = element('article','','culture-reading');
      reading.append(element('small',format.toUpperCase(),'atlas-kicker'),sourceLinks([id]),element('p',description));
      section.append(reading);
    }
  }
  else if (tab === 'grammar') {
    const chain = element('ol', '', 'culture-chain');
    profile.grammar.split(' → ').forEach(step => chain.append(element('li',step.replace(/\.$/,''))));
    section.append(element('h3','Последовательность'),chain);
  } else if (tab === 'bridge') {
    const [peer, reading] = profile.bridge.split('|');
    const pair = tasteAtlas.parallels.find(p => [p.a,p.b].includes(item.id) && [p.a,p.b].includes(peer));
    section.append(dossierSection('Как читать сходство',reading),
      internalLink('#library/' + peer + '/grammar', 'грамматика · ' + tasteAtlas.cultures[peer].title),
      internalLink('#compare/' + (pair?.id ?? item.id + '~' + peer), 'граф двух маршрутов →'));
  } else {
    const labels = {context:'Происхождение и рамка',table:'Как устроен стол',variation:'Местные и авторские варианты'};
    section.append(dossierSection(labels[tab],profile[tab]));
    if (tab === 'context') section.append(dossierSection('Стол и подача',profile.table),
      internalLink('#library/' + item.id + '/grammar','разобрать последовательность →'));
  }

  const modules = element('div', '', 'culture-modules');
  modules.append(element('div','ОПЕРАЦИИ ДЛЯ КОМБАЙНА','atlas-kicker'));
  for (const id of profile.modules) {
    const part = alchemyById.get(id);
    modules.append(internalLink('#compose/use/' + id, '＋ ' + part.title));
  }
  libraryDetail.replaceChildren(element('div', 'C' + number + ' / ' + item.zone, 'atlas-kicker'), hero, choices,
    section, modules, researchLink('cultures','Obsidian · кухни и их грамматики'), sourceLinks(profile.sources));
  if (restoreTabFocus) choices.querySelector('[aria-current="page"]').focus({preventScroll:true});
}

const ayurvedaButtons = new Map();
function openAyurvedaChapter(id) {
  const chapter = tasteAtlas.ayurvedaChapters.find(item => item.id === id) ?? tasteAtlas.ayurvedaChapters[0];
  for (const [key, button] of ayurvedaButtons) mark(button, key === chapter.id);
  $atlas('ayurveda-chapter').replaceChildren(
    element('div',chapter.label,'atlas-kicker'), element('h2',chapter.title), element('p',chapter.text),
    dossierSection('Перенос на кухню',chapter.operation), dossierSection('Проба',chapter.trial),
    internalLink(chapter.href, chapter.link + ' →'), researchLink('ayurveda','Obsidian · девять глав и конспект'),
    sourceLinks(chapter.sources));
}

function renderAyurvedaChapters() {
  for (const chapter of tasteAtlas.ayurvedaChapters) {
    const button = control(chapter.label, () => {
      history.replaceState(null,'','#ayurveda/' + chapter.id);
      openAyurvedaChapter(chapter.id);
    });
    ayurvedaButtons.set(chapter.id,button);
    $atlas('ayurveda-chapters').append(button);
  }
  openAyurvedaChapter();
}

function alchemyPlan(parts, track) {
  const [base, heat, aroma, body, finish] = parts;
  const has = (item, tag) => item.tags.includes(tag);
  const flags = [];
  const separate = new Set();
  const add = (label, body, sources = []) => flags.push({label, body, sources});
  if (heat.medium === 'surface' && base.medium === 'liquid') {
    separate.add('heat');
    add('Поверхность отдельно', 'Жидкая основа остаётся в миске. Жарь обсушенный компонент отдельно и введи его при сборке.', ['chickenHeat']);
  }
  if (heat.id === 'wide-pan' && !['stock-rice','rice-mung'].includes(base.id)) {
    separate.add('heat');
    add('Выдели порцию риса', 'Для опыта с толщиной слоя используй готовый рис отдельно от выбранной основы.', ['paella']);
  }
  if (body.id === 'tahini-water' && base.id !== 'chickpea-base') {
    separate.add('body');
    add('Подготовь нут отдельно', 'Настрой тахини с водой в отдельной порции готового нута, затем реши, как подать её рядом.', ['hummus']);
  }
  if (has(body,'needsBrown')) {
    if (!has(heat,'brown')) separate.add('body');
    add('Связь жара и соуса', has(heat,'brown') ?
      'Выбранный жар может оставить прижарки. Сними их после подрумянивания и настройки основного компонента.' :
      'Сделай прижарки отдельной операцией с малой порцией продукта. Остальные этапы продолжай в своих средах.', ['pan']);
  }
  if (base.medium === 'mass' && [heat,aroma,body].some(item => item.medium === 'liquid')) {
    for (const item of [heat,aroma,body]) if (item.medium === 'liquid') separate.add(item.role);
    add('Жидкость как боковая ветка', 'Отмерь немного готового бульона или воды отдельно. В ней приготовь выбранный настой или соус и пробуй его с массой дозированно.');
  }
  if (base.medium === 'liquid' && ['mass','solids'].includes(body.medium)) {
    separate.add('body');
    add('Сохрани отдельную текстуру', 'Отжим и связывание делай с готовой зеленью, овощами или нутом отдельно. Добавь в жидкую основу только при пробе.');
  }
  if (has(body,'concentrate') && (has(aroma,'salt') || has(finish,'salt'))) {
    add('Соль после концентрации', 'Оцени соль после выпаривания. Солёную пасту или ферментированный финиш прибавляй постепенно, сравнивая с исходной ложкой.', ['tasteMix']);
  }
  if (has(body,'acid') && has(finish,'acid')) {
    add('Два входа кислоты', 'Уксус на влажной стадии и отдельная кислая добавка могут перекрыть друг друга. Оставь две пробы с одинаковой основой и проверь один поздний акцент.', ['tasteMix']);
  }
  if (has(body,'offheat') || has(finish,'fresh')) {
    add('Выключение огня', 'Закончить нагрев нужно до внесения масла для эмульсии или свежей кислоты. Оцени при одной температуре: запах и текстуру записывай отдельно.', ['emulsion','tomkha','soupTemp']);
  }
  if (has(aroma,'fat') && has(body,'fat')) {
    add('Две роли жира', 'Жир аромата проходит прогрев, жир соуса меняет текстуру. Сохрани желаемую насыщенность и в первой пробе меняй только одну порцию жира.', ['emulsion']);
  }
  if ((has(base,'delicate') || has(aroma,'delicate')) && (has(finish,'heat') || has(aroma,'heat'))) {
    add('Аромат и жжение', 'Отложи часть настоя до сильной специи. Сравни запах настоя и жжение по разным шкалам.', ['oral']);
  }
  if (has(base,'starch') && has(body,'starch')) {
    add('Плотность уже есть', 'Вноси загуститель в отдельную жидкость малыми дозами и проверь вязкость после минуты отдыха.');
  }
  if (has(finish,'crunch')) {
    separate.add('finish');
    add('Хруст у края', 'Держи хрустящий компонент отдельно до первого укуса. Время контакта с влажной основой можно сделать параметром пробы.');
  }
  if (track.id === 'plant' && parts.some(part => part.tags.some(tag => ['dairy','animal'].includes(tag)) ||
      ['dashi-base','stock-rice','kimchi-finish','short-infusion'].includes(part.id))) {
    add('Проверь растительную дорожку', 'Выбранный маршрут требует проверки состава. Возьми овощную жидкость и настой комбу, гхи или масло замени подходящим растительным жиром, а кимчи проверь на рыбные добавки.');
  }
  return {flags, separate};
}

let alchemyState;
const alchemyStorage = 'foodos:alchemy:v1';
function parseAlchemy(values) {
  const roles = tasteAtlas.alchemyRoles;
  if (values?.length !== roles.length + 2 || values.slice(0,5).some((id,i) => alchemyById.get(id)?.role !== roles[i].id)
      || !tasteAtlas.alchemyTracks.some(track => track.id === values[5]) || !roles.some(role => role.id === values[6])) return null;
  return values;
}

function renderAlchemyShell() {
  let saved;
  try { saved = parseAlchemy(JSON.parse(localStorage.getItem(alchemyStorage))); } catch {}
  const state = {setup:saved ?? tasteAtlas.alchemyPresets[0].setup.slice(), active:'base'};
  const root = $atlas('alchemy');
  const preset = element('select');
  preset.append(selectOption('Выбрать готовую пробу',''));
  for (const item of tasteAtlas.alchemyPresets) preset.append(selectOption(item.name,item.id));
  preset.addEventListener('change', () => {
    const found = tasteAtlas.alchemyPresets.find(item => item.id === preset.value);
    if (!found) return;
    state.setup = found.setup.slice();
    state.active = state.setup[6];
    updateAlchemy();
  });
  const track = element('select');
  for (const item of tasteAtlas.alchemyTracks) track.append(selectOption(item.name,item.id));
  track.addEventListener('change', () => {
    state.setup[5] = track.value;
    updateAlchemy();
  });
  const variable = element('select');
  for (const role of tasteAtlas.alchemyRoles) variable.append(selectOption(role.name,role.id));
  variable.addEventListener('change', () => {
    state.setup[6] = variable.value;
    updateAlchemy();
  });

  const controls = element('div', '', 'compose-selects alchemy-controls');
  for (const [name,input] of [['Готовая проба',preset],['Дорожка',track],['Переменная для A/B',variable]]) {
    const label = element('label',name);
    label.append(input);
    controls.append(label);
  }

  const chain = element('div', '', 'alchemy-chain');
  chain.setAttribute('aria-label','Пять стадий комбайна');
  const nodes = new Map();
  for (const role of tasteAtlas.alchemyRoles) {
    const button = control('', () => {
      state.active = role.id;
      paintAlchemy();
    }, 'alchemy-node');
    const name = element('b',role.name);
    const partName = element('small');
    const note = element('small','отдельная ветка','alchemy-node-note');
    note.hidden = true;
    button.append(graphIcon(role.icon), name, partName, note);
    button.dataset.stage = role.id;
    nodes.set(role.id,{button,partName,note});
    chain.append(button);
  }

  const bench = element('div', '', 'alchemy-bench');
  const editor = element('section', '', 'atlas-readout alchemy-editor');
  const plan = element('section', '', 'atlas-readout alchemy-plan');
  const exported = element('details', '', 'alchemy-export');
  const field = element('textarea');
  field.readOnly = true;
  field.rows = 8;
  field.setAttribute('aria-label','План пробы FoodOS');
  const status = element('small');
  status.setAttribute('role','status');
  const copy = element('button','копировать план','chip');
  copy.type = 'button';
  copy.addEventListener('click',async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      status.textContent = 'План скопирован';
    } catch {
      field.focus();
      field.select();
      status.textContent = document.execCommand('copy') ? 'План скопирован' : 'План выделен для копирования';
    }
  });
  exported.append(element('summary','Текст для Obsidian или трекера'),field,copy,status);

  const links = element('div', '', 'atlas-choice alchemy-reading');
  const permalink = internalLink('#compose','ссылка на эту пробу','atlas-source');
  links.append(researchLink('lab','Obsidian · устройство комбайна'),permalink,internalLink('#library','библиотека культур →'));
  bench.append(editor,plan);
  root.append(controls,chain,bench,exported,links);
  alchemyState = Object.assign(state,{preset,track,variable,nodes,editor,plan,field,status,permalink});
}

function updateAlchemy() {
  const setup = alchemyState.setup;
  try { localStorage.setItem(alchemyStorage,JSON.stringify(setup)); } catch {}
  history.replaceState(null,'','#compose/' + setup.join('~'));
  paintAlchemy();
}

function openAlchemy(path, moduleId) {
  if (!alchemyState) renderAlchemyShell();
  const state = alchemyState;
  if (path === 'use' && alchemyById.has(moduleId)) {
    const item = alchemyById.get(moduleId);
    const index = tasteAtlas.alchemyRoles.findIndex(role => role.id === item.role);
    state.setup[index] = item.id;
    state.setup[6] = state.active = item.role;
    updateAlchemy();
    return;
  }
  const decoded = parseAlchemy(path?.split('~'));
  if (decoded) {
    state.setup = decoded;
    state.active = decoded[6];
    try { localStorage.setItem(alchemyStorage,JSON.stringify(decoded)); } catch {}
  }
  paintAlchemy();
}

function paintAlchemy() {
  const state = alchemyState;
  const roles = tasteAtlas.alchemyRoles;
  const parts = state.setup.slice(0,5).map(id => alchemyById.get(id));
  const track = tasteAtlas.alchemyTracks.find(item => item.id === state.setup[5]);
  const activeIndex = roles.findIndex(role => role.id === state.active);
  const variableIndex = roles.findIndex(role => role.id === state.setup[6]);
  const edited = parts[activeIndex];
  const variable = parts[variableIndex];
  const {flags, separate} = alchemyPlan(parts, track);
  state.track.value = track.id;
  state.variable.value = variable.role;
  state.preset.value = tasteAtlas.alchemyPresets.find(item => item.setup.join('~') === state.setup.join('~'))?.id ?? '';

  for (const [i,role] of roles.entries()) {
    const node = state.nodes.get(role.id);
    mark(node.button,role.id === state.active);
    node.partName.textContent = parts[i].title;
    node.button.classList.toggle('alchemy-variable',i === variableIndex);
    node.note.hidden = !separate.has(role.id);
    node.button.dataset.separate = String(!node.note.hidden);
  }

  const select = element('select');
  select.dataset.role = edited.role;
  for (const option of tasteAtlas.alchemy.filter(item => item.role === edited.role)) {
    select.append(selectOption(option.title + ' · ' + tasteAtlas.cultures[option.culture].title,option.id));
  }
  select.value = edited.id;
  select.addEventListener('change', () => {
    state.setup[activeIndex] = select.value;
    updateAlchemy();
    state.editor.querySelector('select').focus({preventScroll:true});
  });
  const label = element('label',roles[activeIndex].question);
  label.append(select);
  state.editor.replaceChildren(element('div','СТАДИЯ 0' + (activeIndex+1) + ' / ' + roles[activeIndex].name,'atlas-kicker'),
    element('h2',edited.title),label,element('p',edited.action),
    internalLink('#library/' + edited.culture + '/grammar',tasteAtlas.cultures[edited.culture].title + ' →'),
    sourceLinks(edited.sources));

  const transitions = element('ol', '', 'alchemy-flags');
  for (const flag of flags) {
    const li = element('li');
    li.append(element('b',flag.label),element('p',flag.body));
    if (flag.sources.length) li.append(sourceLinks(flag.sources));
    transitions.append(li);
  }
  state.plan.replaceChildren(element('div','ПРОТОКОЛ FOODOS / ' + track.name,'atlas-kicker'),
    element('h2','две ложки · ' + roles[variableIndex].name),element('p',track.text),
    dossierSection('A · контроль','Приготовь две одинаковые маленькие порции. Оставь выбранную операцию в привычном для себя виде.'),
    dossierSection('B · одна переменная',variable.change),
    element('p',variable.check,'atlas-cue'),element('b','Переходы между стадиями'));
  if (flags.length) state.plan.append(transitions);
  else state.plan.append(element('p','Пройди выбранные этапы и проверь перед смешиванием температуру обеих порций.'));
  if (track.sources.length) state.plan.append(sourceLinks(track.sources));

  const lines = parts.map((part,i) => (i+1) + '. ' + roles[i].name + ' · ' + part.title + ' · ' +
    tasteAtlas.cultures[part.culture].title + '\n   ' + part.action);
  state.field.value = [
    '# Домашняя проба FoodOS',track.text,'',...lines,'','## Переходы',
    ...flags.map(flag => '- ' + flag.label + '. ' + flag.body),
    '', '## Две ложки', 'A · привычная версия. B · ' + variable.change,
    'Запиши: ' + variable.check,'','## Источники',
    ...[...new Set([...parts.flatMap(part => part.sources), ...track.sources, ...flags.flatMap(flag => flag.sources)])].map(id => {
      const [name,url] = tasteAtlas.sources[id];
      return '- [' + name + '](' + url + ')';
    }),
  ].join('\n');
  state.status.textContent = '';
  const cultureCount = new Set(parts.map(part => part.culture)).size;
  $atlas('alchemy-count').textContent = '05 СТАДИЙ / ' + cultureCount + ' ' +
    (cultureCount === 1 ? 'КУХНЯ' : cultureCount < 5 ? 'КУХНИ' : 'КУХОНЬ');
  state.permalink.href = '#compose/' + state.setup.join('~');
}
