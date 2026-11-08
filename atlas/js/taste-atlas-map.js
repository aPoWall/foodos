const mapPoints = [
  ...tasteAtlas.world.map(item => ({id:item.id,name:item.dish,culture:item.id,...tasteAtlas.dishMarks[item.id]})),
  ...tasteAtlas.fieldDinners.map(item => ({id:item.id,name:item.name,culture:item.culture,...item.point,meal:item.id})),
];
const pointsById = new Map(mapPoints.map(point => [point.id,point]));
const builtInPointCount = mapPoints.length;
const networkLinks = [
  ...tasteAtlas.parallels.map(item => ({
    a:item.a, b:item.b, lens:item.lens, title:item.title, detail:item.difference, route:item.id,
  })),
  ...tasteAtlas.fieldEdges.map(([a,b,lens,title,detail]) => ({a,b,lens,title,detail,route:a+'~'+b})),
];
const mapAxes = ['Вода в готовой основе','Роль жира','Время процесса'];
const axisLegends = [
  ['почти сухая','мало свободной воды','влажный слой или соус','основа готовится в воде','жидкость остаётся в тарелке'],
  ['отдельного жира нет','лёгкая заправка','жир несёт аромат','жир задаёт плотность','жир определяет характер'],
  ['быстрая сборка','десятки минут','примерно час или меньше','несколько часов или много стадий','ночь или дни'],
];
const mapState = {culture:'kitchari',lens:'all',edge:null,points:['ghee-chicken-kitchari','ghee-lamb-lentils'],yaw:34,pitch:-19};
let mapMounted = false;
const mapURL = (tab,id) => '#map/' + tab + (id ? '/'+id : '');

function mountAtlasMap() {
  mapMounted = true;
  const culture = $atlas('network-culture');
  for (const item of tasteAtlas.world) culture.append(selectOption(tasteAtlas.cultures[item.id].title,item.id));
  culture.addEventListener('change', () => selectNetworkCulture(culture.value));
  const lenses = $atlas('network-lenses');
  for (const [id,label] of [['all','все связи'],...Object.entries(techniqueLenses).map(([id,[title]]) => [id,title])]) {
    const button = control(label, () => {
      mapState.lens = id;
      mapState.edge = null;
      renderNetwork();
    });
    button.dataset.lens = id;
    lenses.append(button);
  }
  for (const [index,id] of ['space-a','space-b'].entries()) {
    const select = $atlas(id);
    select.addEventListener('change', () => selectMapPoint(index,select.value));
  }
  for (const [axis,id] of [['yaw','space-yaw'],['pitch','space-pitch']]) {
    $atlas(id).addEventListener('input', event => {
      mapState[axis] = Number(event.currentTarget.value);
      drawSpace();
    });
  }
  const stage = $atlas('space-graph');
  let drag;
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('[data-point]')) return;
    drag = [event.clientX,event.clientY,mapState.yaw,mapState.pitch];
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!drag) return;
    mapState.yaw = ((drag[2]+(event.clientX-drag[0])*.6+540)%360)-180;
    mapState.pitch = Math.max(-75,Math.min(75,drag[3]+(event.clientY-drag[1])*.5));
    drawSpace();
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name, () => { drag = null; });
}

function openAtlasMap(tab,id) {
  if (!mapMounted) mountAtlasMap();
  const space = tab === 'space';
  $atlas('map-network').hidden = space;
  $atlas('map-space').hidden = !space;
  for (const mode of ['network','space']) {
    const link = $atlas('map-mode-'+mode);
    if ((mode === 'space') === space) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  if (space) {
    refreshPersonalPoints();
    if (pointsById.has(id)) {
      if (mapState.points[1] === id) mapState.points[1] = mapState.points[0];
      mapState.points[0] = id;
    }
    renderSpace();
  } else {
    if (worldById.has(id)) {
      mapState.culture = id;
      mapState.edge = null;
    }
    renderNetwork();
  }
}

function refreshPersonalPoints() {
  for (const point of mapPoints.splice(builtInPointCount)) pointsById.delete(point.id);
  const entries = fieldMounted ? fieldLog : getFieldLog();
  for (const item of entries.filter(entry=>entry.map && entry.status!=='archived')) {
    const point = {id:'log-'+item.id,name:item.name,culture:item.map.culture,axis:item.map.axis,
      reason:item.result || item.baseline || 'Личная версия из журнала экспериментов.'};
    pointsById.set(point.id,point);
    mapPoints.push(point);
  }
  if (mapState.points.some(id=>!pointsById.has(id))) mapState.points=tasteAtlas.fieldDinners.map(item=>item.id);
  for (const id of ['space-a','space-b']) {
    $atlas(id).replaceChildren(...mapPoints.map((point,i)=>selectOption(
      (i>=builtInPointCount ? 'Моя проба · ' : '')+point.name,point.id)));
  }
  $atlas('space-graph').setAttribute('aria-label',mapPoints.length+' точек на карте');
}

function selectNetworkCulture(id) {
  mapState.culture = id;
  mapState.edge = null;
  history.replaceState(null,'',mapURL('network',id));
  renderNetwork();
}

function renderNetwork() {
  const {culture,lens} = mapState;
  const [cx,cy] = [310,185];
  const items = tasteAtlas.world;
  const coords = new Map(items.map((item,i) => {
    const angle = i/items.length*2*Math.PI-Math.PI/2;
    return [item.id,[cx+252*Math.cos(angle),cy+154*Math.sin(angle)]];
  }));
  const edges = networkLinks.filter(e => lens === 'all' || e.lens === lens);
  const nearby = edges.filter(e => [e.a,e.b].includes(culture));
  const selected = nearby.includes(mapState.edge) ? mapState.edge : nearby[0];
  $atlas('network-culture').value = culture;
  $atlas('network-lenses').querySelectorAll('button').forEach(b => mark(b,b.dataset.lens === lens));
  const svg = svgNode('svg',{viewBox:'0 0 620 370','aria-label':'Связи между кухнями'});
  svg.append(svgNode('ellipse',{cx,cy,rx:252,ry:154,class:'field-orbit'}));
  for (const edge of [...edges.filter(e=>!nearby.includes(e)), ...nearby]) {
    const [x1,y1] = coords.get(edge.a);
    const [x2,y2] = coords.get(edge.b);
    const isNearby = nearby.includes(edge);
    const wire = svgNode('path',{
      d:'M'+x1+' '+y1+' Q'+cx+' '+cy+' '+x2+' '+y2,
      class:'field-wire'+(edge===selected?' on':isNearby?' neighbor':''),
    });
    if (isNearby) wire.addEventListener('click', () => {mapState.edge = edge;renderNetwork();});
    svg.append(wire);
  }
  const related = new Set(nearby.flatMap(edge=>[edge.a,edge.b]));
  items.forEach((item,i) => {
    const [x,y] = coords.get(item.id);
    const node = svgNode('g',{transform:'translate('+x+' '+y+')',class:'field-vertex'+(item.id===culture?' on':related.has(item.id)?' neighbor':'')});
    const title = svgNode('title',{});
    title.textContent = tasteAtlas.cultures[item.id].title;
    const numeral = svgNode('text',{y:4});
    numeral.textContent = String(i+1).padStart(2,'0');
    node.append(title,svgNode('circle',{r:15}),numeral);
    node.addEventListener('click',()=>selectNetworkCulture(item.id));
    svg.append(node);
  });
  $atlas('network-graph').replaceChildren(svg);
  const detail = $atlas('network-detail');
  const profile = tasteAtlas.cultures[culture];
  const links = element('div','','atlas-choice field-relations');
  nearby.forEach(edge => {
    const button = control(edge.title, () => {mapState.edge = edge;renderNetwork();});
    mark(button,edge===selected);
    links.append(button);
  });
  detail.replaceChildren(element('div',nearby.length+' СВЯЗЕЙ В ЭТОМ СЛОЕ','atlas-kicker'),
    element('h2',profile.title),element('p',profile.principle),links);
  if (selected) {
    const peer = selected.a===culture ? selected.b : selected.a;
    detail.append(dossierSection(tasteAtlas.cultures[peer].title,selected.detail),
      internalLink('#compare/'+selected.route,'открыть сравнение шагов →'));
  } else detail.append(element('p','Выбери другой слой, чтобы увидеть связи этой кухни.'));
  detail.append(internalLink('#library/'+culture+'/reading','читать о кухне →'));
}

function selectMapPoint(index,id) {
  if (!pointsById.has(id)) return;
  const other = 1-index;
  if (mapState.points[other] === id) mapState.points[other] = mapState.points[index];
  mapState.points[index] = id;
  renderSpace();
}

function projectPoint(coords) {
  const yaw = mapState.yaw*Math.PI/180;
  const pitch = mapState.pitch*Math.PI/180;
  const [x,y,z] = coords.map(value=>value-2);
  const left = x*Math.cos(yaw)+z*Math.sin(yaw);
  const depth = -x*Math.sin(yaw)+z*Math.cos(yaw);
  const top = y*Math.cos(pitch)-depth*Math.sin(pitch);
  const forward = y*Math.sin(pitch)+depth*Math.cos(pitch);
  const scale = 52 * 11/(11-forward);
  return [310+left*scale,191-top*scale,forward];
}

function drawSpace() {
  const svg = svgNode('svg',{viewBox:'0 0 620 390','aria-label':'Куб. Точки размещены по воде, жиру и времени'});
  const line = (a,b,className) => {
    const [x1,y1] = projectPoint(a);
    const [x2,y2] = projectPoint(b);
    svg.append(svgNode('line',{x1,y1,x2,y2,class:className}));
  };
  for (const x of [0,4]) for (const y of [0,4]) line([x,y,0],[x,y,4],'field-wire');
  for (const x of [0,4]) for (const z of [0,4]) line([x,0,z],[x,4,z],'field-wire');
  for (const y of [0,4]) for (const z of [0,4]) line([0,y,z],[4,y,z],'field-wire');
  const axes = [[4,0,0],[0,4,0],[0,0,4]];
  for (const [i,coords] of axes.entries()) {
    line([0,0,0],coords,'field-wire axis');
    const [x,y] = projectPoint(coords);
    const label = svgNode('text',{x,y:y-8,class:'space-axis','text-anchor':'middle'});
    label.textContent = ['ВОДА','ЖИР','ВРЕМЯ'][i];
    svg.append(label);
  }
  const pair = mapState.points.map(id=>pointsById.get(id));
  line(pair[0].axis,pair[1].axis,'field-wire axis');
  const dots = mapPoints.map(point=>[point,projectPoint(point.axis)]).sort((a,b)=>a[1][2]-b[1][2]);
  const overlapping = new Map();
  for (const [point] of dots) {
    const key = point.axis.join(',');
    if (!overlapping.has(key)) overlapping.set(key,[]);
    overlapping.get(key).push(point.id);
  }
  for (const [point,[anchorX,anchorY]] of dots) {
    const cluster = overlapping.get(point.axis.join(','));
    const angle = cluster.indexOf(point.id)*2*Math.PI/cluster.length;
    const offset = cluster.length>1 ? 12 : 0;
    const x = anchorX + offset*Math.cos(angle);
    const y = anchorY + offset*Math.sin(angle);
    const index = mapState.points.indexOf(point.id);
    const node = svgNode('g',{transform:'translate('+x+' '+y+')',class:'field-vertex space-dot'+(index>=0?' on':''),
      'data-point':point.id});
    const title = svgNode('title',{});
    title.textContent = point.name;
    node.append(title,svgNode('circle',{r:index>=0?12:7}));
    if (index>=0) {
      const label = svgNode('text',{y:4});
      label.textContent = index===0?'A':'B';
      node.append(label);
    }
    node.addEventListener('click', event => selectMapPoint(event.shiftKey?1:0,point.id));
    svg.append(node);
  }
  $atlas('space-graph').replaceChildren(svg);
  $atlas('space-yaw').value = mapState.yaw;
  $atlas('space-pitch').value = mapState.pitch;
}

function renderSpace() {
  const pair = mapState.points.map(id=>pointsById.get(id));
  pair.forEach((point,i) => {$atlas(i===0?'space-a':'space-b').value=point.id;});
  const detail = $atlas('space-detail');
  detail.replaceChildren(...pair.map((point,i) => {
    const card = element('section','','atlas-readout space-point');
    const axes = element('dl','','space-scale');
    point.axis.forEach((value,i)=>axes.append(element('dt',mapAxes[i]+' · '+value+'/4'),element('dd',axisLegends[i][value])));
    const actions = element('div','','atlas-choice');
    actions.append(internalLink('#library/'+point.culture+'/example','открыть пример →'));
    if (point.meal) {
      const recipe = element('a','готовить по шагам →','chip');
      recipe.href = 'cook.html?meal='+point.meal;
      actions.append(recipe);
    }
    card.append(element('div',i===0?'ТОЧКА A':'ТОЧКА B','atlas-kicker'),element('h2',point.name),element('p',point.reason),axes,actions);
    return card;
  }));
  if (pair[0].culture !== pair[1].culture) {
    detail.append(internalLink('#compare/'+pair.map(point=>point.culture).join('~'),'сравнить маршруты кухонь →','chip space-compare'));
  } else {
    detail.append(internalLink('#library/'+pair[0].culture+'/grammar','открыть общую кулинарную логику →','chip space-compare'));
  }
  drawSpace();
}
