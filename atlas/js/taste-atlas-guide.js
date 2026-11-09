export function mountRecipeGuide(dish, clips, initialStep = 0) {
  const root = $atlas('dish-guide');
  const overview = $atlas('dish-audio');
  const audio = new Audio();
  let index = initialStep;
  let deadline = null;
  let ticker = null;
  let remaining = 0;
  let finished = false;
  let voiceOn = true;

  const step = () => dish.steps[index];
  const clock = element('strong', '', 'guide-clock');
  clock.setAttribute('role','timer');
  clock.setAttribute('aria-live','off');
  const meter = element('progress');
  meter.setAttribute('aria-label','Ход таймера');
  const counter = element('div','','atlas-kicker');
  const title = element('h2');
  const lead = element('p');
  const tip = element('p','','atlas-cue');
  const timerLabel = element('small');
  const status = element('small');
  status.setAttribute('role','status');
  const origin = element('div','','guide-origin');
  const controls = element('div','','atlas-choice');
  const timer = control('запустить таймер',toggleTimer);
  const back = control('← назад',() => select(index-1,true));
  const next = control('дальше →',advance);
  const replay = control('▷ озвучить этап',narrate);
  const voice = control('голос · вкл',() => {
    voiceOn = !voiceOn;
    mark(voice,voiceOn);
    voice.textContent = voiceOn ? 'голос · вкл' : 'голос · выкл';
    if (!voiceOn) stopVoice();
  });
  mark(voice,true);
  for (const button of [timer,back,next,replay]) button.removeAttribute('aria-pressed');
  controls.append(back,timer,next,replay,voice);
  root.replaceChildren(counter,title,lead,tip,origin,timerLabel,clock,meter,controls,status);

  const rows = [...$atlas('dish-steps').children];
  const buttons = rows.map((row,i) => {
    const button = control(String(i+1).padStart(2,'0')+' · '+dish.steps[i].title,() => select(i,true),'guide-step');
    button.removeAttribute('aria-pressed');
    const tradition = dish.steps[i].origin;
    row.replaceChildren(button,element('small',tradition?.label || '',tradition?.highlight ? 'guide-rasa' : ''));
    return button;
  });

  function stopVoice() {
    audio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  function narrate() {
    if (finished) return;
    overview.pause();
    stopVoice();
    const clip = clips[step().id];
    if (clip) {
      audio.src = clip.src;
      audio.play().catch(() => {});
    } else if ('speechSynthesis' in window) {
      const reading = new SpeechSynthesisUtterance(step().text);
      reading.lang = 'ru-RU';
      speechSynthesis.speak(reading);
    }
  }

  function paintClock() {
    const seconds = Math.ceil(remaining/1000);
    clock.textContent = Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    meter.value = step().time - seconds;
    timer.textContent = deadline !== null ? 'пауза' :
      remaining === 0 ? 'повторить таймер' :
      remaining < step().time*1000 ? 'продолжить' : 'запустить таймер';
  }

  function tick() {
    remaining = Math.max(0,deadline-Date.now());
    if (!remaining) {
      stopClock();
      status.textContent = 'Время вышло. Сверься с признаком готовности и нажми «дальше».';
    }
    paintClock();
  }

  function stopClock() {
    clearInterval(ticker);
    ticker = null;
    deadline = null;
  }

  function toggleTimer() {
    if (deadline !== null) {
      tick();
      stopClock();
      paintClock();
      return;
    }
    if (!remaining) remaining = step().time*1000;
    if (voiceOn && remaining === step().time*1000) narrate();
    deadline = Date.now()+remaining;
    ticker = setInterval(tick,200);
    status.textContent = '';
    paintClock();
  }

  function select(position,speak = false) {
    stopClock();
    stopVoice();
    finished = false;
    index = position;
    const item = step();
    const source = item.origin;
    const timed = Number.isFinite(item.time) && item.time>0;
    remaining = timed ? item.time*1000 : 0;
    counter.textContent = 'Живой сценарий · '+(index+1)+' / '+dish.steps.length;
    title.textContent = item.title;
    lead.textContent = item.text;
    tip.textContent = item.tip || '';
    tip.hidden = !item.tip;
    origin.classList.toggle('is-ayurvedic',!!source?.highlight);
    origin.replaceChildren();
    if (source) {
      origin.append(element('b',source.label),element('p',source.text));
      if (source.href) origin.append(internalLink(source.href,'↗ источник','atlas-source'));
    }
    clock.hidden = meter.hidden = timer.hidden = timerLabel.hidden = !timed;
    timerLabel.textContent = item.timerLabel || 'Ориентир по времени';
    if (timed) {
      meter.max = item.time;
      paintClock();
    }
    back.disabled = index===0;
    next.textContent = index===dish.steps.length-1 ? 'завершить' : 'дальше →';
    replay.disabled = false;
    status.textContent = timed ? '' : 'Переходи дальше, когда проверишь вкус.';
    for (const [i,button] of buttons.entries()) {
      if (i===index) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    }
    if (speak && voiceOn) narrate();
  }

  function advance() {
    if (finished) return select(0);
    if (index<dish.steps.length-1) return select(index+1,true);
    stopClock();
    stopVoice();
    finished = true;
    counter.textContent = 'Живой сценарий · завершён';
    status.textContent = 'Готово к подаче.';
    next.textContent = 'начать заново';
    replay.disabled = true;
  }

  overview.addEventListener('play',stopVoice);
  root.hidden = false;
  select(initialStep);
  return () => {
    stopClock();
    stopVoice();
    overview.removeEventListener('play',stopVoice);
    root.hidden = true;
  };
}
