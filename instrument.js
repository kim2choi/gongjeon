// Native browser APIs checked for Safari 26.3 / Chrome 158 on 2026-11-27.
// https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
// https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
(() => {
  'use strict';
  const scores = [
    { name: '황혼의 고리', title: ['Rings of', 'Dusk'], scale: 'D MINOR PENTATONIC', id: 'rings-of-dusk',
      bpm: 84, space: 38, cycles: [2,3,4,6], phases: [.08,.57,.86,.34], colors: ['#F39A76','#E8C78D','#76B8AE','#99BCE1'] },
    { name: '밀물의 파동', title: ['Tidal', 'Echoes'], scale: 'A MAJOR PENTATONIC', id: 'tidal-echoes',
      bpm: 68, space: 61, cycles: [2,3,5,4], phases: [.64,.13,.51,.94], colors: ['#91D9BD','#E4D4A3','#75B7CF','#A6A4D9'] },
    { name: '보랏빛 월식', title: ['Violet', 'Eclipse'], scale: 'C MINOR PENTATONIC', id: 'violet-eclipse',
      bpm: 104, space: 48, cycles: [3,4,5,7], phases: [.63,.04,.38,.82], colors: ['#DDA8E0','#E6B4A2','#90C2CA','#AAA8E6'] }
  ];
  const names = ['베이스', '플럭', '글라스 벨', '말렛'];
  const $ = selector => document.querySelector(selector);
  const mixer = $('#voices');
  const play = $('#play');
  const tempo = $('#tempo');
  const space = $('#space');
  const guide = $('#guide');
  const sequence = $('#sequence');
  const audio = new OrbitSound();
  const state = { preset: 0, selected: 0, playing: false, enabled: [true,true,true,true],
    phases: [], pulses: [0,0,0,0] };
  let score, bpm, offsets, stepZero, cursor;
  let barAnchor = 0, timeAnchor = 0, interval, frame, playRequest = 0;
  let pendingHits = [], manualSteps = [0,0,0,0], flashAt = [-Infinity,-Infinity,-Infinity,-Infinity];
  let lastDraw = -Infinity, lastBeat = -1, noticeTimer;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const art = new OrbitArt($('#orbit'), {onSelect: i => selectVoice(i), onPhase: moveMoon, onPluck: audition});
  const fraction = n => n - Math.floor(n);
  const snap = n => Math.abs(n - Math.round(n)) < 1e-8 ? Math.round(n) : n;
  const period = () => 480 / bpm;
  const barAt = time => state.playing ? barAnchor + (time-timeAnchor)/period() : barAnchor;
  const rawAt = (i,bar) => snap(offsets[i] + score.cycles[i] * bar);
  const nextBoundary = (i,bar) => Math.ceil(rawAt(i,bar));

  function notice(message) {
    clearTimeout(noticeTimer);
    $('#notice').textContent = message;
    noticeTimer = setTimeout(() => { $('#notice').textContent = ''; }, 3400);
  }

  function preview(canvas, preset) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const bg = ['#222f40','#183c46','#322f48'][preset];
    const color = ['#ec996b','#9bccba','#c19fcd'][preset];
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);
    let seed = 19 + preset;
    const random = () => (seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i=0; i<240; i++) {
      ctx.globalAlpha = .2 + random()*.5;
      ctx.fillStyle = '#f1ddc6';
      ctx.fillRect(random()*w, random()*h, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
    const x = w * [.54,.64,.56][preset], y = h * [.52,.54,.52][preset];
    const r = h * [.33,.30,.38][preset], tilt = [-.30,.20,-.38][preset];
    function ring(size, start, stop) {
      ctx.beginPath();
      ctx.ellipse(x,y,size,size * .29,tilt,start,stop);
      ctx.stroke();
    }
    ctx.lineWidth=1.4; ctx.strokeStyle=color;
    for (let i=1; i<=4; i++) ring(r*(1.25+i*.40), Math.PI, Math.PI*2);
    const g = ctx.createLinearGradient(x-r,y-r,x+r,y+r);
    g.addColorStop(0,'#fbebc3'); g.addColorStop(.36,color); g.addColorStop(1,bg);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle=bg; ctx.lineWidth=1.6; ctx.globalAlpha=.45;
    for(let i=-9;i<10;i++) {
      ctx.beginPath(); ctx.moveTo(x-r*1.2,y+i*r*.15);
      ctx.bezierCurveTo(x-r*.4,y+i*r*.15+r*.3,x+r*.4,y+i*r*.15-r*.2,x+r*1.2,y+i*r*.15+r*.15); ctx.stroke();
    }
    ctx.restore();
    if (preset===2) {
      ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(x+r*.29,y-r*.12,r*.91,0,Math.PI*2); ctx.fill();
    }
    ctx.strokeStyle=color;
    for (let i=1;i<=4;i++) { ctx.globalAlpha=.82-i*.1; ring(r*(1.25+i*.40),0,Math.PI); }
    ctx.globalAlpha=1;
  }

  function setupMixer() {
    names.forEach((name,i) => {
      const row = document.createElement('div');
      row.className = 'voice';
      row.innerHTML = '<button type="button" class="voice-key" data-voice="'+i+'"><i class="voice-planet" aria-hidden="true"></i><span><span class="voice-name">'+name+'</span><span class="voice-cycles"></span></span><kbd class="voices-digit">'+(i+1)+'</kbd></button><button type="button" class="mute" data-mute="'+i+'"><i class="speaker" aria-hidden="true"></i></button>';
      const key = row.querySelector('.voice-key');
      key.setAttribute('aria-label',name+' 한 음 연주. 좌우 방향키로 박자 이동');
      key.title = name+' 연주 ('+(i+1)+') · ← → 박자 이동';
      key.addEventListener('click', () => audition(i));
      key.addEventListener('keydown', event => {
        if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
        event.preventDefault();
        selectVoice(i);
        const phase = fraction(rawAt(i,barAt(audio.now)) + (event.key==='ArrowLeft' ? -1 : 1)/32);
        moveMoon(i,phase); notice(name+' 궤도 위치 '+Math.round(phase*360)+'°');
      });
      row.querySelector('.mute').addEventListener('click', () => {
        state.enabled[i] = !state.enabled[i];
        if (!state.enabled[i]) audio.stop(i);
        refreshSchedule(i);
        updateMixer(); wake();
      });
      mixer.append(row);
    });
  }

  function updateMixer() {
    $('#voice-count').textContent=state.enabled.filter(Boolean).length+' / 4 ON';
    Array.from(mixer.children).forEach((row,i) => {
      row.style.setProperty('--color',score.colors[i]);
      row.classList.toggle('is-muted',!state.enabled[i]);
      row.querySelector('.voice-cycles').textContent = '8박에 '+score.cycles[i]+'번';
      const mute = row.querySelector('.mute');
      mute.setAttribute('aria-pressed',String(!state.enabled[i]));
      mute.setAttribute('aria-label',names[i]+' 음소거');
      mute.title = names[i] + (state.enabled[i] ? ' 음소거' : ' 소리 켜기');
    });
  }

  function selectVoice(i) { state.selected=i; wake(); }

  function setSliders() {
    tempo.value = bpm;
    $('#cycle-duration').textContent = '8박 · '+period().toFixed(2)+'초';
    $('#tempo-value').innerHTML = bpm+' <small>BPM</small>';
    $('#space-value').innerHTML = space.value+' <small>%</small>';
    for (const input of [tempo,space]) {
      const fill = (input.value-input.min)/(input.max-input.min)*100;
      input.style.setProperty('--fill',fill+'%');
    }
    tempo.setAttribute('aria-valuetext',bpm+' BPM');
    space.setAttribute('aria-valuetext',space.value+'%');
    audio.setSpace(Number(space.value)/100);
  }

  function transportLabel() {
    document.body.classList.toggle('playing',state.playing);
    const text = state.playing ? '일시정지' : '연주 시작';
    play.setAttribute('aria-label',text);
    play.setAttribute('aria-pressed',String(state.playing));
    $('#play-label').textContent=text;
    $('#stage-state').textContent=state.playing ? 'IN ORBIT' : 'STANDBY';
  }

  function applyScore(preset) {
    const running = state.playing;
    audio.stop();
    state.preset=preset;
    state.selected=0;
    state.enabled=names.map(() => true);
    score=scores[preset];
    bpm=score.bpm; space.value=score.space;
    offsets=[...score.phases]; stepZero=offsets.map(Math.ceil); cursor=[...stepZero];
    barAnchor=0; timeAnchor=audio.now;
    pendingHits=[]; manualSteps=[0,0,0,0]; flashAt.fill(-Infinity);
    $('#score-number').textContent='SCORE № 0'+(preset+1);
    $('#preset-count').textContent='0'+(preset+1)+' / 03';
    $('#score-name').textContent=score.name;
    $('#title-top').textContent=score.title[0]; $('#title-bottom').textContent=score.title[1];
    $('#scale-name').textContent=score.scale;
    $('#sky').style.setProperty('--sky-accent',score.colors[0]);
    document.querySelectorAll('[data-preset]').forEach((button,i) => button.setAttribute('aria-pressed',String(i===preset)));
    setSliders(); updateMixer(); transportLabel();
    if (running) schedule();
    if (frame) cancelAnimationFrame(frame);
    lastDraw=-Infinity;
    render(performance.now());
  }

  // Schedule crossings against the audio clock. Animation merely reads the same position.
  function schedule() {
    if (!state.playing) return;
    const now=audio.now, end=barAt(now+.14);
    for (let i=0;i<4;i++) {
      if (!state.enabled[i]) continue;
      cursor[i]=Math.max(cursor[i],nextBoundary(i,barAt(now-.025)));
      while (cursor[i]<=rawAt(i,end)) {
        const atBar=(cursor[i]-offsets[i])/score.cycles[i];
        const when=timeAnchor+(atBar-barAnchor)*period();
        audio.pluck(i,state.preset,cursor[i]-stepZero[i],when);
        pendingHits.push({i,when});
        cursor[i]++;
      }
    }
  }

  function refreshSchedule(voice=null) {
    audio.cancelScheduled(voice);
    const now=audio.now;
    pendingHits=pendingHits.filter(hit => hit.when<=now || (voice!==null && hit.i!==voice));
    for (let i=0;i<4;i++) {
      if (voice===null || i===voice) cursor[i]=nextBoundary(i,barAt(now));
    }
    schedule();
  }

  function moveMoon(i,phase) {
    const bar=barAt(audio.now);
    const nextNote=nextBoundary(i,bar)-stepZero[i];
    offsets[i]=phase-bar*score.cycles[i];
    stepZero[i]=Math.ceil(phase)-nextNote;
    refreshSchedule(i); wake();
  }

  async function audition(i) {
    selectVoice(i);
    const request=playRequest, preset=state.preset;
    try {
      await audio.unlock();
      if (request!==playRequest || preset!==state.preset) return;
      audio.pluck(i,preset,manualSteps[i]++);
      flashAt[i]=performance.now(); wake();
    } catch (error) { notice(error.message || '오디오 출력을 열 수 없습니다.'); }
  }

  function pause() {
    playRequest++;
    barAnchor=barAt(audio.now);
    state.playing=false;
    clearInterval(interval); audio.stop();
    pendingHits=[]; flashAt.fill(-Infinity);
    transportLabel(); wake();
  }

  async function togglePlay() {
    if (state.playing) { pause(); return; }
    if (play.disabled) return;
    const request=++playRequest;
    play.disabled=true;
    try {
      await audio.unlock();
      if (request!==playRequest || document.hidden) return;
      timeAnchor=audio.now;
      state.playing=true;
      cursor=offsets.map((_,i) => nextBoundary(i,barAnchor));
      schedule(); interval=setInterval(schedule,30);
      transportLabel(); wake();
    } catch (error) {
      pause(); notice(error.message || '오디오 출력을 열 수 없습니다.');
    } finally { play.disabled=false; }
  }

  function drawScore(bar) {
    const width=sequence.clientWidth, height=sequence.clientHeight;
    if (!width || !height) return;
    const dpr=Math.min(devicePixelRatio || 1,2);
    if (sequence.width!==Math.round(width*dpr) || sequence.height!==Math.round(height*dpr)) {
      sequence.width=Math.round(width*dpr); sequence.height=Math.round(height*dpr);
    }
    const c=sequence.getContext('2d');
    c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,width,height);
    for(let beat=0;beat<9;beat++) {
      c.fillStyle=beat===4 ? '#b5baaf' : '#d9dbd0';
      c.fillRect(Math.min(width-1,Math.round(beat*width/8)),0,1,height);
    }
    for(let i=0;i<4;i++) {
      const y=i*height/4+2;
      c.fillStyle='#e7e9e0'; c.fillRect(0,y+1,width,1);
      c.fillStyle=state.enabled[i] ? score.colors[i] : '#d2d4cb';
      const first=fraction(-offsets[i]);
      for(let k=0;k<score.cycles[i];k++) {
        const x=(first+k)/score.cycles[i]*width;
        const size=Math.min(width-x,Math.max(3,width/45));
        c.fillRect(x,y,size,3);
        c.fillStyle=state.enabled[i] ? '#34423c' : '#aeb6ac'; c.fillRect(x,y,1,3);
        c.fillStyle=state.enabled[i] ? score.colors[i] : '#d2d4cb';
      }
    }
    c.fillStyle='#34423c'; c.fillRect(Math.min(width-1,fraction(bar)*width),0,1.5,height);
    const beat=Math.floor(fraction(bar)*8);
    if (beat!==lastBeat) { $('#position').textContent=(beat+1)+' / 8'; lastBeat=beat; }
  }

  function render(timestamp) {
    frame=0;
    const now=audio.now, bar=barAt(now);
    pendingHits=pendingHits.filter(hit => {
      if(hit.when>now) return true;
      flashAt[hit.i]=Math.max(flashAt[hit.i],timestamp-(now-hit.when)*1000);
      return false;
    });
    for(let i=0;i<4;i++) {
      state.phases[i]=fraction(rawAt(i,bar));
      state.pulses[i]=Math.max(0,1-(timestamp-flashAt[i])/470);
    }
    if (!reduced.matches || !state.playing || timestamp-lastDraw>65) {
      art.render(state); drawScore(bar); lastDraw=timestamp;
    }
    if (state.playing || state.pulses.some(p => p>0)) wake();
  }
  function wake() { if (!frame) frame=requestAnimationFrame(render); }

  setupMixer();
  document.querySelectorAll('[data-preset]').forEach((button,i) => {
    preview(button.querySelector('canvas'),i);
    button.addEventListener('click',() => { if (state.preset!==i) applyScore(i); });
  });
  play.addEventListener('click',togglePlay);
  $('#reset').addEventListener('click',() => { pause(); applyScore(state.preset); notice('현재 악보를 처음 상태로 되돌렸습니다.'); });
  tempo.addEventListener('input',() => {
    const now=audio.now; barAnchor=barAt(now); timeAnchor=now;
    bpm=Number(tempo.value); setSliders(); refreshSchedule(); wake();
  });
  space.addEventListener('input',setSliders);
  $('#help').addEventListener('click',() => guide.showModal());
  guide.addEventListener('click',event => {
    const rect=guide.getBoundingClientRect();
    if(event.target===guide && (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)) guide.close();
  });
  document.addEventListener('keydown',event => {
    if(guide.open || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if(event.key>='1' && event.key<='4' && event.key.length===1) { event.preventDefault(); audition(Number(event.key)-1); }
    if(event.code==='Space' && !event.target.closest('button,a,textarea,input:not([type=range])')) { event.preventDefault(); togglePlay(); }
  });
  document.addEventListener('visibilitychange',() => {
    if(document.hidden) pause();
    else wake();
  });
  window.addEventListener('pagehide',pause);
  new ResizeObserver(wake).observe(sequence);

  $('#export').addEventListener('click',async event => {
    if(!state.enabled.some(Boolean)) { notice('저장할 궤도의 소리를 하나 켜 주세요.'); return; }
    const button=event.currentTarget, label=button.querySelector('span');
    const bar=barAt(audio.now), filename='gongjeon-'+score.id+'-'+bpm+'bpm.wav';
    const options={ bpm, preset:state.preset, enabled:[...state.enabled], space:Number(space.value)/100,
      cycles:[...score.cycles], phases:offsets.map((_,i)=>fraction(rawAt(i,bar))),
      steps:offsets.map((_,i)=>nextBoundary(i,bar)-stepZero[i]) };
    button.disabled=true; label.textContent='저장 중…';
    try {
      const blob=await audio.renderWav(options);
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.download=filename; link.href=url; document.body.append(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      notice('여덟 박의 연주를 WAV로 만들었습니다.');
    } catch (error) { notice('WAV 저장에 실패했습니다. '+(error.message || '다시 시도해 주세요.')); }
    finally { button.disabled=false; label.textContent='WAV 저장'; }
  });
  applyScore(0);
})();
