function researchLink(note) {
  const pages = {
    cases:['#library','Профили, примеры и источники'],
    comparisons:['#map/network','Граф связей'],
    cultures:['#library','Библиотека культур'],
    ayurveda:['#ayurveda','Аюрведическая карта'],
    lab:['#compose','Комбайн и источники'],
  };
  const [route,label] = pages[note];
  return internalLink(route,label+' →','atlas-source');
}

function internalLink(hash, label, style = 'chip') {
  const link = element('a', label, style);
  link.href = hash;
  return link;
}

function dossierSection(label, body) {
  const section = element('section', '', 'dossier-section');
  section.append(element('h3', label), element('p', body));
  return section;
}

function renderDossier(item) {
  const data = tasteAtlas.dossiers[item.id];
  const dossier = element('div', '', 'library-dossier');
  const actions = element('div', '', 'atlas-choice dossier-actions');
  const pair = tasteAtlas.parallels.find(p => [p.a,p.b].includes(item.id));
  actions.append(internalLink('#compare/' + pair.id, 'сравнить · ' + worldById.get(pair.a === item.id ? pair.b : pair.a).dish),
    researchLink('cases', 'Obsidian · досье и источники'));
  dossier.append(element('div', 'ДОСЬЕ / КОНТЕКСТ · МЕХАНИЗМ · ПРОБА', 'atlas-kicker'),
    dossierSection('Кухня и версия', data.context),
    dossierSection('Как строится вкус', data.mechanism),
    dossierSection('Что контролировать', data.controls),
    dossierSection('Две ложки', data.trial),
    actions, sourceLinks([...new Set([...item.sources, ...data.links])]));
  return dossier;
}

function renderAyurvedaBridges() {
  const grid = $atlas('ayurveda-bridges');
  for (const [title, body, pair, sources] of tasteAtlas.ayurvedaBridges) {
    const panel = element('div', '', 'atlas-readout');
    panel.append(element('h2', title), element('p', body),
      internalLink('#compare/' + pair, 'проверить на двух кухнях →'), sourceLinks(sources));
    grid.append(panel);
  }
  grid.after(researchLink('comparisons', 'Obsidian · rasa, обработка и сочетания'));
}

let compareState;

function initComparison() {
  const selects = ['left','right','pair'].map(side => $atlas('compare-' + side));
  for (const select of selects.slice(0,2)) {
    for (const item of tasteAtlas.world) select.append(selectOption(tasteAtlas.cultures[item.id].title, item.id));
    select.addEventListener('change', () => {
      const [left, right] = selects;
      if (left.value === right.value) {
        const other = select === left ? right : left;
        other.value = tasteAtlas.world.find(item => item.id !== select.value).id;
      }
      const pair = tasteAtlas.parallels.find(p => p.a === left.value && p.b === right.value);
      const id = pair?.id ?? left.value + '~' + right.value;
      history.replaceState(null, '', '#compare/' + id);
      openComparison(id, compareState.lens);
    });
  }
  for (const pair of tasteAtlas.parallels) selects[2].append(selectOption(pair.title, pair.id));
  selects[2].addEventListener('change', () => {
    if (selects[2].value) location.hash = '#compare/' + selects[2].value;
  });

  const lenses = {};
  for (const [id,label] of [['all','вся цепь'], ...Object.entries(techniqueLenses).map(([id,[name]]) => [id,name])]) {
    lenses[id] = control(label, () => {
      compareState.lens = id;
      paintComparison();
    });
    $atlas('compare-lenses').append(lenses[id]);
  }
  const graph = $atlas('compare-graph');
  const overlay = svgNode('svg', {class:'compare-overlay', 'aria-hidden':'true'});
  const tracks = [element('div', '', 'compare-track'), element('div', '', 'compare-track')];
  graph.append(...tracks, overlay);
  const observer = new ResizeObserver(drawComparison);
  observer.observe(graph);
  tracks.forEach(track => observer.observe(track));
  compareState = {selects, lenses, graph, overlay, tracks, lens:'all', buttons:[], edges:[], edge:-1};
}

function openComparison(requested, lens = 'all') {
  if (!compareState) initComparison();
  const route = requested?.split('~') ?? [];
  const explicit = tasteAtlas.parallels.find(p => p.id === requested);
  const valid = route.length === 2 && route[0] !== route[1] && route.every(id => worldById.has(id));
  const pair = explicit || (valid ? tasteAtlas.parallels.find(p =>
    route.includes(p.a) && route.includes(p.b)) : tasteAtlas.parallels[0]);
  const [left,right] = valid ? route : [pair.a,pair.b];
  Object.assign(compareState, {pair, items:[worldById.get(left),worldById.get(right)], lens});
  compareState.selects[0].value = left;
  compareState.selects[1].value = right;
  compareState.selects[2].value = pair?.id ?? '';
  paintComparison();
}

function inferredEdges(a, b, lens) {
  const data = tasteAtlas.dossiers;
  const pairs = [];
  data[a.id].stages.forEach((left,i) => {
    const options = data[b.id].stages.map((right,j) => [j, left.filter(tag => right.includes(tag))])
      .filter(([,tags]) => lens === 'all' ? tags.length : tags.includes(lens))
      .sort(([j,x],[k,y]) => y.length - x.length || Math.abs(j - i) - Math.abs(k - i));
    if (options.length) {
      const [j,tags] = options[0];
      const label = tags.map(tag => techniqueLenses[tag][0]).join(' + ');
      pairs.push([i,j,label,'Общие метки: ' + label + '. Сравни эти шаги по их назначению и результату.']);
    }
  });
  return pairs;
}

function paintComparison() {
  const state = compareState;
  const {lens, pair, items:[a,b]} = state;
  for (const [id,button] of Object.entries(state.lenses)) mark(button,id === lens);
  const stages = [a,b].map(item => tasteAtlas.dossiers[item.id].stages);
  const fit = (i,j) => lens === 'all' || stages[0][i].includes(lens) && stages[1][j].includes(lens);
  let edges = pair ? pair.edges.map(([i,j,...rest]) => a.id === pair.a ? [i,j,...rest] : [j,i,...rest])
    .filter(([i,j]) => fit(i,j)) : [];
  state.curated = !!edges.length;
  if (!edges.length) edges = inferredEdges(a,b,lens);
  state.edges = edges;
  state.buttons = [a,b].map((item,side) => {
    const title = element('div', '', 'compare-track-title');
    title.append(element('small', item.region), element('b', item.dish));
    const buttons = item.route.map(([name,body],i) => {
      const node = control('', () => selectComparisonStep(side,i,body), 'compare-node');
      node.append(element('small', '0' + (i + 1) + ' / ' + stages[side][i].map(tag => techniqueLenses[tag][0]).join(' · ')),
        element('b', name));
      node.classList.toggle('dim', lens !== 'all' && !stages[side][i].includes(lens));
      return node;
    });
    state.tracks[side].replaceChildren(title,...buttons);
    return buttons;
  });
  const links = $atlas('compare-edges');
  state.edgeButtons = edges.map(([i,j,label],k) =>
    control('0' + (i + 1) + ' ↔ 0' + (j + 1) + ' · ' + label, () => selectComparisonEdge(k)));
  links.replaceChildren(...state.edgeButtons);
  if (edges.length) selectComparisonEdge(0);
  else {
    state.edge = -1;
    $atlas('compare-stage').replaceChildren(element('small','ОБЩИЙ ЭТАП НЕ НАЙДЕН'),
      element('p',techniqueLenses[lens]?.[1] ?? 'Выбери шаг слева или справа, чтобы прочитать его.'));
    drawComparison();
  }
  const box = $atlas('compare-reading');
  renderCultureComparison(a,b);
  if (pair) {
    const reading = element('div', '', 'atlas-readout compare-essay');
    reading.append(element('div', 'РАЗБОР / ' + techniqueLenses[pair.lens][0], 'atlas-kicker'),
      element('h2', pair.title),
      dossierSection('Общий ход', pair.common),
      dossierSection('Где пути расходятся', pair.difference),
      dossierSection('Что попробовать', pair.kitchen),
      sourceLinks(pair.sources));
    box.replaceChildren(reading);
  } else {
    box.replaceChildren(...[a,b].map(item => {
      const reading = element('div', '', 'atlas-readout');
      reading.append(element('div', 'ПРОБА ИЗ ДОСЬЕ', 'atlas-kicker'), element('h2', item.dish),
        element('p', tasteAtlas.dossiers[item.id].trial), sourceLinks(tasteAtlas.dossiers[item.id].links));
      return reading;
    }));
  }
  const actions = element('div', '', 'atlas-choice compare-actions');
  actions.append(researchLink('comparisons', 'Obsidian · сравнения и метод'));
  box.append(actions);
}

function renderCultureComparison(a, b) {
  const box = $atlas('culture-comparison');
  const profiles = [a,b].map(item => {
    const profile = tasteAtlas.cultures[item.id];
    const panel = element('div','','atlas-readout');
    panel.append(element('div','ПРОФИЛЬ / ' + item.zone,'atlas-kicker'),element('h2',profile.title),
      element('p',profile.principle),dossierSection('Порядок приёмов',profile.grammar),
      internalLink('#library/' + item.id + '/grammar','читать профиль →'));
    const modules = element('div','','atlas-choice');
    for (const id of profile.modules) modules.append(internalLink('#compose/use/' + id,'＋ ' + alchemyById.get(id).title));
    modules.classList.add('culture-modules');
    panel.append(modules);
    return panel;
  });
  const [peer, relation] = tasteAtlas.cultures[a.id].bridge.split('|');
  const [otherPeer, otherRelation] = tasteAtlas.cultures[b.id].bridge.split('|');
  if (peer === b.id || otherPeer === a.id) {
    const text = element('p',peer === b.id ? relation : otherRelation,'atlas-cue culture-comparison-note');
    profiles.push(text);
  }
  box.replaceChildren(...profiles);
}

function selectComparisonEdge(index) {
  const state = compareState;
  const [i,j,label,body] = state.edges[index];
  state.edge = index;
  state.edgeButtons.forEach((button,k) => mark(button,index === k));
  state.buttons.forEach((track,side) => track.forEach((button,k) => mark(button,k === [i,j][side])));
  $atlas('compare-stage').replaceChildren(element('small', (state.curated ? 'РАЗБОР СВЯЗИ' : 'СОВПАДЕНИЕ МЕТОК') + ' / ' + label),
    element('p',body));
  drawComparison();
}

function selectComparisonStep(side,index,body) {
  const state = compareState;
  state.edge = -1;
  state.edgeButtons.forEach(button => mark(button,false));
  state.buttons.forEach((track,k) => track.forEach((button,i) => mark(button,k === side && i === index)));
  $atlas('compare-stage').replaceChildren(element('small',state.items[side].dish + ' / 0' + (index + 1)), element('p',body));
  drawComparison();
}

function drawComparison() {
  if (!compareState) return;
  const {graph, overlay, buttons, edges, edge} = compareState;
  const frame = graph.getBoundingClientRect();
  if (!frame.width || !frame.height) return;
  overlay.setAttribute('viewBox','0 0 ' + frame.width + ' ' + frame.height);
  overlay.replaceChildren(...edges.map(([i,j],k) => {
    const a = buttons[0][i].getBoundingClientRect();
    const b = buttons[1][j].getBoundingClientRect();
    const x1 = a.right - frame.left, x2 = b.left - frame.left;
    const y1 = a.top + a.height/2 - frame.top, y2 = b.top + b.height/2 - frame.top;
    const mid = (x1 + x2)/2;
    const curve = 'M' + x1 + ',' + y1 + ' C' + mid + ',' + y1 + ' ' + mid + ',' + y2 + ' ' + x2 + ',' + y2;
    const path = svgNode('path',{d:curve,class:'compare-edge' + (k === edge ? ' current' : '')});
    const tap = svgNode('path',{d:curve,class:'compare-edge-tap'});
    tap.addEventListener('click', () => selectComparisonEdge(k));
    const group = svgNode('g',{});
    group.append(path,tap);
    return group;
  }));
}

function renderOperationIndex() {
  const root = $atlas('operation-index');
  const table = element('table', '', 'operation-table');
  table.setAttribute('aria-label','Этапы приготовления по типам операций');
  const head = element('thead');
  const headings = element('tr');
  const labels = Object.entries(techniqueLenses);
  for (const label of ['Блюдо', ...labels.map(([, [name]]) => name)]) {
    const cell = element('th',label);
    cell.scope = 'col';
    headings.append(cell);
  }
  head.append(headings);
  const body = element('tbody');
  const panel = element('div', '', 'atlas-readout operation-panel');
  panel.setAttribute('aria-live', 'polite');
  const scroller = element('div', '', 'operation-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label','Таблица операций, 21 блюдо');
  let active;
  function select(item, id, button, matching) {
    if (active) mark(active,false);
    active = button;
    mark(button,true);
    const [name, question] = techniqueLenses[id];
    const steps = element('ul', '', 'operation-steps');
    for (const [[label,detail], i] of matching) {
      const row = element('li');
      row.append(element('b','0' + (i+1) + ' · ' + label), element('p',detail));
      steps.append(row);
    }
    const pair = tasteAtlas.parallels.find(p => [p.a,p.b].includes(item.id) && p.lens === id) ||
      tasteAtlas.parallels.find(p => [p.a,p.b].includes(item.id));
    const actions = element('div', '', 'atlas-choice');
    actions.append(internalLink('#library/' + item.id, 'открыть досье →'),
      internalLink('#compare/' + pair.id, 'сравнить →'));
    panel.replaceChildren(element('div', 'ОПЕРАЦИЯ / ' + name, 'atlas-kicker'),
      element('h2',item.dish), element('p',question), steps, actions);
  }
  for (const item of tasteAtlas.world) {
    const tr = element('tr');
    const rowHead = element('th');
    rowHead.scope = 'row';
    rowHead.append(internalLink('#library/' + item.id, item.dish, 'operation-dish'));
    tr.append(rowHead);
    for (const [id,[name]] of labels) {
      const cell = element('td');
      const data = tasteAtlas.dossiers[item.id];
      const matching = item.route.map((step,i) => [step,i]).filter(([,i]) => data.stages[i].includes(id));
      if (matching.length) {
        const button = control(String(matching.length), () => select(item,id,button,matching),'operation-cell');
        button.setAttribute('aria-label', item.dish + ' · ' + name + ': ' + matching.length);
        mark(button,false);
        cell.append(button);
        if (item.id === 'kitchari' && id === 'fat') select(item,id,button,matching);
      } else {
        cell.append(element('span','·','operation-empty'));
      }
      tr.append(cell);
    }
    body.append(tr);
  }
  table.append(head,body);
  scroller.append(table);
  root.append(scroller,panel);
}
