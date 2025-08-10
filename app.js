
// Auscultation Lab — procedurally generated training audio using Web Audio API.
// No external audio files are needed. Everything plays in browser, works offline via Service Worker.

const state = {
  ctx: null,
  master: null,
  ambient: null,
  siren: null,
  sounds: [],
  quiz: { current: null, answerId: null },
  installPrompt: null,
};

// -------------------- Data model --------------------
// category: 'heart' | 'lung'
// id must be unique
const SOUND_LIBRARY = [
  // HEART
  {
    id: 'normal_s1s2',
    name: 'Normal S1/S2',
    category: 'heart',
    description: 'Regular lub‑dub with normal splitting; no murmurs.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 'normal', rate }),
    tags: ['normal', 'physiology']
  },
  {
    id: 's3',
    name: 'S3 (ventricular gallop)',
    category: 'heart',
    description: 'Low‑frequency extra sound after S2; HF or volume overload.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 's3', rate }),
    tags: ['low-frequency', 'CHF']
  },
  {
    id: 's4',
    name: 'S4 (atrial gallop)',
    category: 'heart',
    description: 'Low‑frequency pre‑S1 sound; stiff ventricle/ischemia.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 's4', rate }),
    tags: ['low-frequency']
  },
  {
    id: 'as_murmur',
    name: 'Aortic stenosis',
    category: 'heart',
    description: 'Systolic crescendo‑decrescendo ejection murmur (R 2nd ICS).',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 'as', rate }),
    tags: ['systolic', 'crescendo-decrescendo']
  },
  {
    id: 'mr_murmur',
    name: 'Mitral regurgitation',
    category: 'heart',
    description: 'Holosystolic blowing murmur at apex, radiating to axilla.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 'mr', rate }),
    tags: ['systolic', 'holosystolic']
  },
  {
    id: 'ar_murmur',
    name: 'Aortic regurgitation',
    category: 'heart',
    description: 'Early diastolic decrescendo, high‑frequency, LLSB.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 'ar', rate }),
    tags: ['diastolic', 'decrescendo']
  },
  {
    id: 'ms_rumble',
    name: 'Mitral stenosis',
    category: 'heart',
    description: 'Low‑pitched diastolic rumble; may follow opening snap.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 'ms', rate }),
    tags: ['diastolic', 'rumble', 'low-frequency']
  },
  {
    id: 'pericardial_rub',
    name: 'Pericardial friction rub',
    category: 'heart',
    description: 'Scratchy, triphasic rub independent of respiration.',
    builder: (ctx, rate=1) => synthHeart(ctx, { pattern: 'rub', rate }),
    tags: ['friction', 'inflammation']
  },

  // LUNG
  {
    id: 'vesicular',
    name: 'Vesicular (normal)',
    category: 'lung',
    description: 'Soft inspiratory noise; minimal expiration.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'vesicular', rate }),
    tags: ['normal']
  },
  {
    id: 'bronchial',
    name: 'Bronchial breath sounds',
    category: 'lung',
    description: 'Louder, higher‑pitched, insp = exp; suggests consolidation if peripheral.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'bronchial', rate }),
    tags: ['consolidation']
  },
  {
    id: 'wheeze_poly',
    name: 'Polyphonic wheeze',
    category: 'lung',
    description: 'Multiple musical tones, mainly expiratory (asthma/COPD).',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'wheeze', tones: 'poly', rate }),
    tags: ['expiratory', 'asthma', 'COPD']
  },
  {
    id: 'wheeze_mono',
    name: 'Monophonic wheeze',
    category: 'lung',
    description: 'Single musical tone; suggests focal obstruction.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'wheeze', tones: 'mono', rate }),
    tags: ['obstruction']
  },
  {
    id: 'crackles_fine',
    name: 'Crackles (fine)',
    category: 'lung',
    description: 'Brief, high‑frequency pops at bases; CHF/early fibrosis.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'crackles', flavor: 'fine', rate }),
    tags: ['CHF', 'bases']
  },
  {
    id: 'crackles_coarse',
    name: 'Crackles (coarse)',
    category: 'lung',
    description: 'Lower‑pitched, longer crackles; pneumonia/secretions.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'crackles', flavor: 'coarse', rate }),
    tags: ['pneumonia', 'secretions']
  },
  {
    id: 'rhonchi',
    name: 'Rhonchi',
    category: 'lung',
    description: 'Low‑pitched snoring/gurgling; clears with cough.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'rhonchi', rate }),
    tags: ['secretions']
  },
  {
    id: 'stridor',
    name: 'Stridor',
    category: 'lung',
    description: 'High‑pitched inspiratory sound; upper airway obstruction.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'stridor', rate }),
    tags: ['upper airway', 'emergency']
  },
  {
    id: 'pleural_rub',
    name: 'Pleural friction rub',
    category: 'lung',
    description: 'Grating, sandpaper‑like both in/exp; localized pain.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'pleural_rub', rate }),
    tags: ['pleurisy']
  },
  {
    id: 'diminished',
    name: 'Diminished/absent (one side)',
    category: 'lung',
    description: 'Markedly quiet on one side; think pneumothorax/occlusion.',
    builder: (ctx, rate=1) => synthLung(ctx, { type: 'diminished', rate }),
    tags: ['pneumothorax']
  },
];

// -------------------- Audio helpers --------------------
function ensureAudio() {
  if (!state.ctx) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    state.ctx = ctx; state.master = master;
    setupAmbient();
  }
  return state.ctx;
}

function envGain(ctx, startTime, duration, attack=0.01, release=0.05, peak=1.0) {
  const g = ctx.createGain();
  const t0 = startTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + duration - release);
  g.gain.linearRampToValueAtTime(0, t0 + duration);
  return g;
}

function bandNoise(ctx, freqLow, freqHigh, duration) {
  // White noise source through Biquad bandpass
  const bufferSize = Math.floor(duration * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0; i<bufferSize; i++) data[i] = (Math.random()*2-1)*0.6;
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = (freqLow + freqHigh)/2;
  bp.Q.value = bp.frequency.value / Math.max(1, (freqHigh - freqLow));
  src.connect(bp);
  return { src, node: bp };
}

function pinkNoise(ctx) {
  // Voss-McCartney pink noise approximation
  const bufferSize = 4096;
  const node = ctx.createScriptProcessor(bufferSize, 1, 1);
  let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
  node.onaudioprocess = e => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i=0; i<bufferSize; i++) {
      const white = Math.random()*2-1;
      b0 = 0.99886*b0 + white*0.0555179;
      b1 = 0.99332*b1 + white*0.0750759;
      b2 = 0.96900*b2 + white*0.1538520;
      b3 = 0.86650*b3 + white*0.3104856;
      b4 = 0.55000*b4 + white*0.5329522;
      b5 = -0.7616*b5 - white*0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white*0.5362;
      b6 = white*0.115926;
      out[i] = pink * 0.08;
    }
  };
  return node;
}

function setupAmbient() {
  const ctx = state.ctx;
  const g = ctx.createGain(); g.gain.value = 0.0; g.connect(state.master);
  const pn = pinkNoise(ctx); pn.connect(g);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowshelf'; lp.frequency.value = 200; lp.gain.value = 6; // low rumble
  pn.disconnect(); pn.connect(lp); lp.connect(g);

  // Siren (two-tone, gentle)
  const siren = {
    osc: ctx.createOscillator(),
    gain: ctx.createGain(),
    on: false
  };
  siren.osc.type = 'sine';
  siren.gain.gain.value = 0;
  siren.osc.connect(siren.gain); siren.gain.connect(state.master);
  siren.osc.start();

  state.ambient = g;
  state.siren = siren;
}

function setAmbient(on, level) {
  if (!state.ambient) return;
  state.ambient.gain.setTargetAtTime(on ? (level ?? 0.3) : 0, state.ctx.currentTime, 0.2);
}

function setSiren(on) {
  if (!state.siren) return;
  state.siren.on = on;
  const { osc, gain } = state.siren;
  if (on) {
    gain.gain.setTargetAtTime(0.08, state.ctx.currentTime, 0.2);
    // Sweep between two tones
    let up = true;
    if (!state.siren.timer) {
      state.siren.timer = setInterval(() => {
        osc.frequency.setTargetAtTime(up ? 750 : 450, state.ctx.currentTime, 0.25);
        up = !up;
      }, 800);
    }
  } else {
    gain.gain.setTargetAtTime(0, state.ctx.currentTime, 0.2);
    if (state.siren.timer) { clearInterval(state.siren.timer); state.siren.timer = null; }
  }
}

// -------------------- Synthesis engines --------------------
function synthHeart(ctx, opts) {
  const rate = opts.rate ?? 1;
  const bpm = 72 * rate;
  const cycle = 60 / bpm;
  const now = ctx.currentTime + 0.05;
  const length = Math.min(8, 6 * cycle);
  const out = ctx.createGain(); out.gain.value = 0.8;
  out.connect(state.master);

  // Thump generator
  const thump = (time, pitch=60, decay=0.1, gain=0.9) => {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = pitch;
    const g = ctx.createGain(); g.gain.value = 0;
    osc.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.start(time); osc.stop(time + decay + 0.02);
  };

  // Murmur noise between S1 and S2 or after S2
  const murmur = (time, dur, fLow, fHigh, level=0.4, shape='flat') => {
    const { src, node } = bandNoise(ctx, fLow, fHigh, dur);
    const g = ctx.createGain(); g.gain.value = 0;
    node.connect(g); g.connect(out);
    const a = 0.02, r = 0.08;
    if (shape === 'cres-dec') {
      const mid = time + dur/2;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(level, mid);
      g.gain.linearRampToValueAtTime(0, time + dur);
    } else if (shape === 'decay') {
      g.gain.setValueAtTime(level, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    } else {
      g.gain.setValueAtTime(level, time + a);
      g.gain.setValueAtTime(level, time + dur - r);
      g.gain.linearRampToValueAtTime(0, time + dur);
    }
    src.start(time); src.stop(time + dur + 0.02);
  };

  // Base heart sounds
  for (let t = 0; t < length; t += cycle) {
    const s1 = now + t;
    const s2 = s1 + 0.35*cycle;
    thump(s1, 60, 0.11, 0.95); // S1
    thump(s2, 90, 0.09, 0.75); // S2

    switch (opts.pattern) {
      case 's3':
        thump(s2 + 0.15*cycle, 50, 0.08, 0.6);
        break;
      case 's4':
        thump(s1 - 0.12*cycle, 55, 0.07, 0.55);
        break;
      case 'as':
        murmur(s1 + 0.06*cycle, 0.28*cycle, 150, 450, 0.45, 'cres-dec');
        break;
      case 'mr':
        murmur(s1 + 0.05*cycle, 0.35*cycle, 200, 800, 0.38, 'flat');
        break;
      case 'ar':
        murmur(s2 + 0.03*cycle, 0.45*cycle, 300, 1200, 0.35, 'decay');
        break;
      case 'ms':
        // Opening snap then low-frequency rumble
        thump(s2 + 0.08*cycle, 120, 0.05, 0.3);
        murmur(s2 + 0.1*cycle, 0.5*cycle, 40, 120, 0.5, 'flat');
        break;
      case 'rub':
        // Scratchy triphasic
        for (let k=0;k<3;k++) {
          murmur(s1 + k*0.12*cycle, 0.09*cycle, 400, 1600, 0.5, 'flat');
        }
        break;
    }
  }

  // stop output later
  setTimeout(() => out.disconnect(), (length+0.5)*1000);
  return { stop: () => out.disconnect() };
}

function synthLung(ctx, opts) {
  const rate = opts.rate ?? 1;
  const cycle = 5.0 / rate; // seconds per resp cycle ~12 bpm at rate=1
  const now = ctx.currentTime + 0.05;
  const length = Math.min(10, 4 * cycle);
  const out = ctx.createGain(); out.gain.value = 0.9; out.connect(state.master);

  const breath = (start, insp=0.6*cycle, exp=0.4*cycle) => {
    if (opts.type === 'vesicular' || opts.type === 'bronchial' || opts.type === 'diminished') {
      const base = pinkNoise(ctx);
      const g = ctx.createGain(); g.gain.value = 0; base.connect(g); g.connect(out);

      // Filters
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = opts.type === 'bronchial' ? 800 : 300;
      bp.Q.value = 0.8;
      base.disconnect(); base.connect(bp); bp.connect(g);

      const level = opts.type === 'diminished' ? 0.1 : (opts.type === 'bronchial' ? 0.5 : 0.35);

      // Inspiration envelope
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + Math.min(0.3, insp*0.3));
      g.gain.setValueAtTime(level, start + insp - 0.06);
      g.gain.linearRampToValueAtTime(0.02, start + insp);
      // Expiration
      const eStart = start + insp + 0.06;
      const eLevel = opts.type === 'bronchial' ? level*0.9 : level*0.2;
      g.gain.linearRampToValueAtTime(eLevel, eStart + 0.2);
      g.gain.linearRampToValueAtTime(0.0001, start + insp + exp);

      // clean up
      setTimeout(() => { try { base.disconnect(); } catch(e){} }, (start + insp + exp - ctx.currentTime + 0.2)*1000);
    }

    // Adventitious overlays
    if (opts.type === 'wheeze') {
      const tones = opts.tones === 'mono' ? [650] : [400, 520, 760, 980].slice(0, 3 + Math.floor(Math.random()*2));
      const dur = exp*0.85;
      const onset = start + 0.65*insp; // mostly expiratory
      tones.forEach(f => {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0; osc.connect(g); g.connect(out);
        g.gain.setValueAtTime(0, onset);
        g.gain.linearRampToValueAtTime(0.35, onset + 0.1);
        g.gain.linearRampToValueAtTime(0.02, onset + dur);
        osc.start(onset); osc.stop(onset + dur + 0.1);
      });
    }

    if (opts.type === 'crackles') {
      const n = opts.flavor === 'fine' ? 12 : 6;
      const startWin = [0.6*insp, 0.85*insp]; // late inspiration
      for (let i=0;i<n;i++) {
        const t = start + (startWin[0] + Math.random()*(startWin[1]-startWin[0]));
        const click = ctx.createOscillator(); click.type = 'square'; click.frequency.value = 1200 + Math.random()*800;
        const g = ctx.createGain(); g.gain.value = 0; click.connect(g); g.connect(out);
        const d = opts.flavor === 'fine' ? 0.015 : 0.04;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + d*0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + d);
        click.start(t); click.stop(t + d + 0.01);
      }
    }

    if (opts.type === 'rhonchi') {
      const f = 180 + Math.random()*80;
      const { src, node } = bandNoise(ctx, f-40, f+40, exp*0.9);
      const g = ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(out);
      const t = start + insp + 0.05;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.12);
      g.gain.linearRampToValueAtTime(0.0001, t + exp*0.9);
      src.start(t); src.stop(t + exp*0.9 + 0.05);
    }

    if (opts.type === 'stridor') {
      const t = start; const dur = Math.min(1.2, insp*0.9);
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 950;
      const g = ctx.createGain(); g.gain.value = 0; osc.connect(g); g.connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.15);
      g.gain.linearRampToValueAtTime(0.02, t + dur);
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    if (opts.type === 'pleural_rub') {
      for (let k=0;k<2;k++) {
        const t = start + k*(insp*0.6);
        const { src, node } = bandNoise(ctx, 400, 2000, 0.3);
        const g = ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(out);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.6, t + 0.1);
        g.gain.linearRampToValueAtTime(0.02, t + 0.3);
        src.start(t); src.stop(t + 0.35);
      }
    }
  };

  for (let t=0; t<length; t+=cycle) {
    breath(now + t);
  }

  setTimeout(() => out.disconnect(), (length+0.5)*1000);
  return { stop: () => out.disconnect() };
}

// -------------------- UI building --------------------
function $(sel) { return document.querySelector(sel); }
function create(el, attrs={}, children=[]) {
  const node = document.createElement(el);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k,v);
  });
  (Array.isArray(children) ? children : [children]).forEach(ch => ch && node.appendChild(ch));
  return node;
}

function toast(msg, ms=1600) {
  const t = $('#toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._timer); t._timer = setTimeout(()=>{ t.style.display = 'none'; }, ms);
}

function buildCards() {
  const grid = $('#cards'); grid.innerHTML = '';
  const query = ($('#search').value || '').trim().toLowerCase();
  const showHeart = $('#filter-heart').checked;
  const showLung  = $('#filter-lung').checked;

  state.sounds = SOUND_LIBRARY.filter(s =>
    (s.category === 'heart' && showHeart) || (s.category === 'lung' && showLung)
  ).filter(s =>
    !query || s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || s.tags.join(' ').toLowerCase().includes(query)
  );

  state.sounds.forEach(s => {
    const badge = create('span', { class: 'badge', html: s.category.toUpperCase() });
    const title = create('div', { class: 'title' }, [
      create('h3', { html: s.name }),
      badge
    ]);
    const desc = create('p', { html: s.description });
    const row = create('div', { class: 'row' }, [
      create('button', { class: 'btn primary', html: 'Play', onClick: () => playSound(s.id) }),
      create('button', { class: 'btn', html: '▶ with ambient', onClick: () => { toggleAmbient(true); playSound(s.id); } }),
      create('span', { class: 'meta', html: s.tags.map(t=>`#${t}`).join(' ') })
    ]);
    const card = create('article', { class: 'card' }, [title, desc, row]);
    grid.appendChild(card);
  });

  if (!state.sounds.length) {
    grid.appendChild(create('div', { class: 'meta', html: 'No matches. Try different filters or terms.' }));
  }
}

function playSound(id, rate=1) {
  ensureAudio();
  const spec = SOUND_LIBRARY.find(s => s.id === id);
  if (!spec) return;
  spec.builder(state.ctx, rate);
}

function toggleAmbient(on) {
  ensureAudio();
  const level = parseFloat($('#ambient-level').value || '0.3');
  setAmbient(on ?? $('#ambient-toggle').checked, level);
}

function toggleSiren(on) {
  ensureAudio();
  setSiren(on ?? $('#siren-toggle').checked);
}

// -------------------- Practice mode --------------------
function pickQuiz() {
  const pool = SOUND_LIBRARY.filter(s =>
    ((s.category === 'heart' && $('#practice-heart').checked) ||
     (s.category === 'lung'  && $('#practice-lung').checked))
  );
  if (pool.length < 2) return null;
  const answer = pool[Math.floor(Math.random()*pool.length)];
  const distractors = pool.filter(s => s.id !== answer.id)
                          .sort(()=>Math.random()-0.5).slice(0,3);
  const choices = [...distractors, answer].sort(()=>Math.random()-0.5);
  return { answer, choices };
}

function renderPractice() {
  const area = $('#practice-choices'); area.innerHTML = '';
  const q = pickQuiz();
  if (!q) { $('#practice-instructions').textContent = 'Choose at least two categories.'; return; }
  state.quiz.current = q;
  $('#practice-instructions').textContent = 'Listen and pick the correct sound.';
  q.choices.forEach(c => {
    const btn = create('button', { class: 'choice', html: `${c.name} <span class="meta">(${c.category})</span>` });
    btn.addEventListener('click', () => {
      if (c.id === q.answer.id) {
        btn.classList.add('correct');
        $('#practice-feedback').textContent = '✅ Correct!';
      } else {
        btn.classList.add('wrong');
        $('#practice-feedback').textContent = `❌ Not quite. Answer: ${q.answer.name}`;
      }
      setTimeout(renderPractice, 1100);
    });
    area.appendChild(btn);
  });
}

function playPractice() {
  ensureAudio();
  if (!state.quiz.current) renderPractice();
  const rate = parseFloat($('#practice-rate').value || '1');
  if ($('#practice-with-ambient').checked) toggleAmbient(true);
  const ans = state.quiz.current?.answer;
  if (ans) ans.builder(state.ctx, rate);
}

// -------------------- Install / PWA --------------------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e;
  const btn = document.getElementById('install-btn');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (state.installPrompt) {
      state.installPrompt.prompt();
      const { outcome } = await state.installPrompt.userChoice;
      toast(outcome === 'accepted' ? 'Installed!' : 'Install dismissed');
      state.installPrompt = null; btn.hidden = true;
    }
  });
});

// -------------------- Events & init --------------------
function switchTab(which) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === which));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + which));
}

document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  // Filters
  ['search','filter-heart','filter-lung'].forEach(id => document.getElementById(id).addEventListener('input', buildCards));
  // Ambient toggles
  document.getElementById('ambient-toggle').addEventListener('change', () => toggleAmbient());
  document.getElementById('ambient-level').addEventListener('input', () => toggleAmbient());
  document.getElementById('siren-toggle').addEventListener('change', () => toggleSiren());
  // Practice
  document.getElementById('practice-play').addEventListener('click', playPractice);
  ['practice-heart','practice-lung'].forEach(id => document.getElementById(id).addEventListener('change', renderPractice));
  document.getElementById('practice-rate').addEventListener('input', () => {
    document.getElementById('practice-rate').title = 'Rate: ' + document.getElementById('practice-rate').value + 'x';
  });

  buildCards();
  renderPractice();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
});



// ---- Optional: file playback helper (used when adding real recordings) ----
async function playFile(ctx, url, rate=1) {
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(state.master);
  src.start();
}

// ---- Keyboard shortcuts ----
window.addEventListener('keydown', (e) => {
  if (e.key === '/') { e.preventDefault(); document.getElementById('search').focus(); }
  if (e.key.toLowerCase() === 'h') { const c = document.getElementById('filter-heart'); c.checked = !c.checked; buildCards(); }
  if (e.key.toLowerCase() === 'l') { const c = document.getElementById('filter-lung'); c.checked = !c.checked; buildCards(); }
  if (e.key.toLowerCase() === 'a') { const c = document.getElementById('ambient-toggle'); c.checked = !c.checked; toggleAmbient(); }
  if (e.key.toLowerCase() === 's') { const c = document.getElementById('siren-toggle'); c.checked = !c.checked; toggleSiren(); }
});

