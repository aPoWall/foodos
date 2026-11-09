const experimentKey = 'foodos:field-log:v1';
const logStages = {planned:'запланирован',cooking:'готовлю',done:'готово',archived:'архив'};
const knownDinner = new Map(tasteAtlas.fieldDinners.map(item=>[item.id,item]));
let fieldMounted = false;
let fieldDinner = tasteAtlas.fieldDinners[0].id;
let editingExperiment = null;
let fieldLog = [];
let storageAvailable = true;

function localDate() {
  const now = new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}

function cleanExperiment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (key,max) => typeof raw[key] === 'string' ? raw[key].trim().slice(0,max) : '';
  const id = text('id',100);
  const name = text('name',110);
  const date = text('date',10);
  const updated = text('updated',30);
  if (!/^[\w-]+$/.test(id) || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || !Number.isFinite(Date.parse(updated))) return null;
  const map = raw.map;
  const point = map && worldById.has(map.culture) && Array.isArray(map.axis) && map.axis.length===3 &&
    map.axis.every(value=>Number.isInteger(value)&&value>=0&&value<=4) ? {culture:map.culture,axis:map.axis.slice()} : null;
  return {id,name,date,updated,dinner:knownDinner.has(raw.dinner)?raw.dinner:'',
    status:Object.hasOwn(logStages,raw.status)?raw.status:'planned',
    baseline:text('baseline',650),variable:text('variable',650),result:text('result',2000),map:point,
    dish:/^[\w-]{1,80}$/.test(text('dish',80)) ? text('dish',80) : '',
    messages:Array.isArray(raw.messages) ? raw.messages.slice(0,40).flatMap(message => {
      if (!message || !['note','question','chef','guide'].includes(message.role) ||
          typeof message.text !== 'string' || typeof message.at !== 'string' || !Number.isFinite(Date.parse(message.at))) return [];
      return [{role:message.role,text:message.text.trim().slice(0,500),at:message.at.slice(0,30),
        stage:typeof message.stage === 'string' ? message.stage.slice(0,100) : ''}];
    }) : []};
}

function getFieldLog() {
  try {
    const value = JSON.parse(localStorage.getItem(experimentKey));
    return Array.isArray(value) ? value.map(cleanExperiment).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveFieldLog() {
  try {
    localStorage.setItem(experimentKey,JSON.stringify(fieldLog));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}

function writeDishLog(entry) {
  fieldLog = getFieldLog();
  const clean = cleanExperiment({...entry,updated:new Date().toISOString()});
  if (!clean || (fieldLog.length >= 300 && !fieldLog.some(item => item.id === clean.id))) return null;
  fieldLog = [...fieldLog.filter(item => item.id !== clean.id), clean];
  saveFieldLog();
  return storageAvailable ? clean : null;
}

function statusExperiment(message) {
  $atlas('experiment-status').textContent = storageAvailable ? message :
    message+' Хранилище браузера недоступно, скачай JSON, пока страница открыта.';
}

function openFieldLab(slug) {
  if (!fieldMounted) mountFieldLab();
  fieldLog = getFieldLog();
  if (knownDinner.has(slug)) fieldDinner = slug;
  renderDinners();
  renderFieldLog();
}

function mountFieldLab() {
  fieldMounted = true;
  fieldLog = getFieldLog();
  const mapForm = $atlas('experiment-form').elements;
  for (const item of tasteAtlas.world) mapForm.namedItem('mapCulture').append(selectOption(tasteAtlas.cultures[item.id].title,item.id));
  for (const [i,name] of ['mapWater','mapFat','mapTime'].entries()) {
    axisLegends[i].forEach((label,value)=>mapForm.namedItem(name).append(selectOption(value+' · '+label,String(value))));
  }
  const picker = $atlas('dinner-options');
  for (const dinner of tasteAtlas.fieldDinners) {
    const button = control(dinner.name, () => {
      fieldDinner = dinner.id;
      history.replaceState(null,'','#experiments/'+fieldDinner);
      renderDinners();
    });
    button.dataset.dinner = dinner.id;
    picker.append(button);
  }

  $atlas('experiment-form').addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const id = editingExperiment?.id ?? globalThis.crypto?.randomUUID?.() ?? 'e-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    const map = values.mapEnabled ? {culture:values.mapCulture,axis:[values.mapWater,values.mapFat,values.mapTime].map(Number)} : null;
    fieldLog = getFieldLog();
    const current = fieldLog.find(item => item.id === id);
    const entry = cleanExperiment({...current,...values,id,map,updated:new Date().toISOString(),dinner:editingExperiment?.dinner});
    if (!entry) return statusExperiment('Проверь название и дату.');
    if (!editingExperiment && fieldLog.length >= 300) return statusExperiment('Журнал содержит 300 записей. Скачай копию и используй импорт для переноса.');
    fieldLog = [...fieldLog.filter(item=>item.id!==id),entry];
    saveFieldLog();
    fillExperimentForm();
    renderFieldLog();
    statusExperiment('Запись сохранена.');
  });
  $atlas('experiment-clear').addEventListener('click',()=>fillExperimentForm());
  $atlas('experiment-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({version:1,entries:fieldLog},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href=url;
    link.download='foodos-experiments-'+localDate()+'.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    statusExperiment('Копия журнала скачана.');
  });
  $atlas('experiment-import').addEventListener('change',async event => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 12_000_000) throw Error();
      const value = JSON.parse(await file.text());
      if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 300) throw Error();
      const incoming = value.entries.map(cleanExperiment);
      if (incoming.some(entry=>!entry)) throw Error();
      const merged = new Map(getFieldLog().map(entry=>[entry.id,entry]));
      for (const entry of incoming) {
        const prior = merged.get(entry.id);
        if (!prior || Date.parse(prior.updated)<Date.parse(entry.updated)) merged.set(entry.id,entry);
      }
      if (merged.size > 300) throw Error();
      fieldLog = [...merged.values()];
      saveFieldLog();
      renderFieldLog();
      statusExperiment('Импортировано. Записей в журнале – '+fieldLog.length+'.');
    } catch {
      statusExperiment('Нужен JSON из экспорта FoodOS с корректными записями.');
    } finally {
      input.value='';
    }
  });
  fillExperimentForm();
  renderFieldLog();
}

function fillExperimentForm(entry = null) {
  editingExperiment = entry;
  const form = $atlas('experiment-form');
  form.reset();
  form.elements.namedItem('date').value = entry?.date ?? localDate();
  for (const key of ['name','baseline','variable','result','status']) {
    if (entry?.[key]) form.elements.namedItem(key).value = entry[key];
  }
  const map = entry?.map;
  $atlas('experiment-map-fields').open = !!map;
  form.elements.namedItem('mapEnabled').checked = !!map;
  form.elements.namedItem('mapCulture').value = map?.culture ?? 'kitchari';
  ['mapWater','mapFat','mapTime'].forEach((name,i)=>{form.elements.namedItem(name).value=String(map?.axis[i]??2);});
  $atlas('experiment-save').textContent = entry?.id ? 'сохранить изменения' : 'сохранить опыт';
}

function pickExperiment(entry) {
  fillExperimentForm(entry);
  const form = $atlas('experiment-form');
  form.scrollIntoView({block:'nearest'});
  form.elements.namedItem('name').focus({preventScroll:true});
}

function renderDinners() {
  const dinner = knownDinner.get(fieldDinner);
  $atlas('dinner-options').querySelectorAll('button').forEach(button=>mark(button,button.dataset.dinner===fieldDinner));
  const list = element('ol','','dinner-timeline');
  for (const [time,body] of dinner.timeline) {
    const row = element('li');
    row.append(element('b',time),element('p',body));
    list.append(row);
  }
  const track = element('a','открыть трекер →','chip');
  track.href = 'cook.html?meal='+dinner.id;
  const actions = element('div','','atlas-choice');
  actions.append(track,internalLink('#dish/'+dinner.id,'сценарий и журнал →'),internalLink('#map/space/'+dinner.id,'найти в 3D →'),
    control('＋ запланировать опыт',()=>pickExperiment({name:dinner.name,dinner:dinner.id,variable:dinner.variable,
      baseline:dinner.hypothesis,status:'planned'})));
  $atlas('dinner-detail').replaceChildren(element('div',dinner.time+' / АКТИВНО '+dinner.active+' / '+dinner.fat,'atlas-kicker'),
    element('h2',dinner.name),list,
    dossierSection('Две ложки',dinner.variable),
    dossierSection('Что записать',dinner.observation),actions,sourceLinks(dinner.sources));
}

function renderFieldLog() {
  const ordered = fieldLog.slice().sort((a,b)=>a.date.localeCompare(b.date)||b.updated.localeCompare(a.updated));
  const pending = ordered.filter(item=>['planned','cooking'].includes(item.status));
  const complete = ordered.filter(item=>item.status==='done').reverse();
  const archived = ordered.filter(item=>item.status==='archived').reverse();
  const area = $atlas('experiment-list');
  area.replaceChildren();
  for (const [label,items] of [['План и готовка',pending],['Результаты',complete],['Архив',archived]]) {
    if (label==='Архив'&&!items.length) continue;
    const group = element('div','','log-group');
    group.append(element('h3',label+' · '+items.length));
    if (!items.length) group.append(element('p','Пока пусто.'));
    for (const item of items) {
      const card = element('article','','log-entry');
      card.append(element('div',item.date+' / '+logStages[item.status],'atlas-kicker'),element('h4',item.name));
      for (const [key,title] of [['baseline','Гипотеза'],['variable','Переменная'],['result','Результат']]) {
        if (item[key]) card.append(dossierSection(title,item[key]));
      }
      card.append(control('открыть запись',()=>pickExperiment(item)));
      if (item.dish) card.append(internalLink('#dish/'+item.dish+'/'+item.id,'чат и шаги →','atlas-source'));
      if (item.map && item.status !== 'archived') card.append(internalLink('#map/space/log-'+item.id,'своя точка в 3D →','atlas-source'));
      group.append(card);
    }
    area.append(group);
  }
}
