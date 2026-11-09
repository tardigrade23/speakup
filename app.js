/* SpeakUp: AI English conversation partner.
 * Speech in: Web Speech API (SpeechRecognition, en-US). Speech out: speechSynthesis.
 * The AI runs in the Supabase Edge Function english-coach, which keeps the API key on the server.
 * Everything else (progress, words, history) is stored on this device in localStorage.
 */
'use strict';

const SUPABASE_URL = 'https://brrisogdhhzxpxgskbjh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJycmlzb2dkaGh6eHB4Z3NrYmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMjE1MzIsImV4cCI6MjEwOTc5NzUzMn0.lCmVcmlZSdHloPMNFwJP1skA3rh_YVWXeaDP8Zj8v5k';
const API = `${SUPABASE_URL}/functions/v1/english-coach`;
const STORE = 'speakup_v1';

const SCENARIOS = [
  { id: 'free', e: '💬', t: 'Free talk', d: 'İstədiyin mövzuda söhbət' },
  { id: 'daily', e: '☀️', t: 'My day', d: 'Gündəlik həyatın haqqında' },
  { id: 'interview', e: '💼', t: 'Job interview', d: 'İş müsahibəsi məşqi' },
  { id: 'it', e: '💻', t: 'Tech talk', d: 'IT, AI, startaplar' },
  { id: 'travel', e: '✈️', t: 'Travel', d: 'Hava limanı, otel, yol soruşmaq' },
  { id: 'restaurant', e: '🍽️', t: 'Restaurant', d: 'Sifariş vermək, hesab' },
  { id: 'smalltalk', e: '🤝', t: 'Small talk', d: 'Tanışlıq, konfrans' },
  { id: 'shopping', e: '🛍️', t: 'Shopping', d: 'Mağazada alış-veriş' },
  { id: 'doctor', e: '🩺', t: 'At the doctor', d: 'Simptomları izah etmək' },
  { id: 'story', e: '📖', t: 'Tell a story', d: 'Keçmiş zamanla danışmaq' },
  { id: 'debate', e: '⚖️', t: 'Debate', d: 'Fikrini əsaslandır' },
];
const LEVELS = [
  { id: 'A2', d: 'Başlanğıc' }, { id: 'B1', d: 'Orta' }, { id: 'B2', d: 'Yaxşı' }, { id: 'C1', d: 'Peşəkar' },
];

// ---------- state ----------
const defaults = () => ({
  level: 'B1', explain: 'az', goal: 10, rate: 0.95, voice: '', autoSpeak: true, autoSend: true, passcode: '',
  days: {},        // 'YYYY-MM-DD' -> seconds practised
  words: [],       // {word, meaning, at}
  history: [],     // {id, at, scenario, level, messages, feedback}
});
let S = defaults();
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* private mode */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } };

let chat = null; // {id, scenario, level, messages:[{role,content,fixes,words,hint}], startedAt}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function toast(text, ms = 2600) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- practice time + streak ----------
// Time counts while a conversation is open and the app is on screen, at most 90 s
// per gap between two messages, so leaving the app open does not inflate it.
let lastActive = 0;
function addPractice() {
  const now = Date.now();
  if (lastActive) {
    const sec = Math.min(90, (now - lastActive) / 1000);
    const k = dayKey(); S.days[k] = (S.days[k] || 0) + sec; save();
  }
  lastActive = now;
}
function streak() {
  let n = 0; const d = new Date();
  if (!(S.days[dayKey(d)] >= 60)) d.setDate(d.getDate() - 1); // today not done yet: count up to yesterday
  while (S.days[dayKey(d)] >= 60) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function renderToday() {
  const min = Math.floor((S.days[dayKey()] || 0) / 60);
  $('today-min').textContent = min;
  $('today-goal').textContent = `/${S.goal} dəq`;
  const p = Math.min(1, min / S.goal);
  $('ring-fg').style.strokeDashoffset = String(119.4 * (1 - p));
  $('streak-n').textContent = streak();
  $('today-title').textContent = p >= 1 ? 'Bugünkü hədəf tamamlandı! 🎉' : 'Bugünkü məşq';
  $('today-sub').textContent = p >= 1 ? 'Əla! Sabah da davam et.' : `Gündə ${S.goal} dəqiqə danış, ardıcıllığı qoru.`;
}

// ---------- home ----------
function renderHome() {
  $('levels').innerHTML = LEVELS.map((l) => `<button data-level="${l.id}" class="${S.level === l.id ? 'on' : ''}">${l.id}<small>${l.d}</small></button>`).join('');
  $('scenarios').innerHTML = SCENARIOS.map((s) => `<button class="scenario" data-sc="${s.id}"><span class="e">${s.e}</span><b>${s.t}</b><span>${s.d}</span></button>`).join('');
  renderToday();
}
$('levels').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]'); if (!b) return;
  S.level = b.dataset.level; save(); renderHome();
});
$('scenarios').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sc]'); if (!b) return;
  unlockSpeech();
  startChat(b.dataset.sc);
});

// ---------- navigation ----------
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.body.classList.toggle('in-chat', name === 'chat' || name === 'feedback');
  if (name === 'home') renderHome();
  if (name === 'words') renderWords();
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
}
$('tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });

// ---------- API ----------
async function callApi(mode, messages, sc, level) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'x-app-passcode': S.passcode || '',
    },
    body: JSON.stringify({ mode, scenario: sc, level, explain: S.explain, messages }),
  }).catch(() => { throw new Error('İnternetə qoşulmaq olmadı. Bağlantını yoxla.'); });
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  const msg = {
    passcode: 'Giriş kodu səhvdir. Ayarlarda düzgün kodu yaz.',
    rate_limit: 'Çox sorğu getdi. Bir az gözləyib yenidən cəhd et.',
    server_key: 'Serverdə ANTHROPIC_API_KEY düzgün deyil.',
    refusal: 'AI bu mesaja cavab vermədi. Başqa cür yaz.',
    config: 'Server ayarları oxunmadı. Bir az sonra yenidən cəhd et.',
    no_credit: 'Anthropic hesabında kredit qurtarıb. platform.claude.com → Billing bölməsindən balans artır.',
  }[body.error];
  if (msg) throw new Error(msg);
  if (res.status === 404) throw new Error('AI server hələ qurulmayıb (english-coach funksiyası tapılmadı).');
  throw new Error('Server xətası. Bir az sonra yenidən cəhd et.');
}
const apiMessages = () => chat.messages.map((m) => ({ role: m.role, content: m.content }));

// ---------- chat ----------
function startChat(sc) {
  const meta = SCENARIOS.find((s) => s.id === sc) || SCENARIOS[0];
  chat = { id: Date.now().toString(36), scenario: meta.id, level: S.level, messages: [], startedAt: Date.now() };
  $('chat-title').textContent = `${meta.e} ${meta.t}`;
  $('chat-sub').textContent = `Səviyyə ${S.level}`;
  $('messages').innerHTML = '';
  $('hint-bar').hidden = true;
  $('input').value = '';
  lastActive = Date.now();
  show('chat');
  askAi();
}

function bubble(m, i) {
  if (m.role === 'user') {
    let html = `<div class="msg me">${esc(m.content)}</div>`;
    if (m.fixes) {
      html += m.fixes.length
        ? `<details class="fix" open><summary>✏️ ${m.fixes.length} düzəliş</summary>${m.fixes.map((f) => `<div class="item"><span class="from">${esc(f.original)}</span> → <span class="to">${esc(f.corrected)}</span> <button class="say" data-say="${esc(f.corrected)}">🔊</button><div class="why">${esc(f.explanation)}</div></div>`).join('')}</details>`
        : '<div class="fix ok">✓ Səhv yoxdur, əla!</div>';
    }
    return html;
  }
  let html = `<div class="msg ai">${esc(m.content)}<div class="tools"><button data-say-i="${i}">🔊 Dinlə</button><button data-slow-i="${i}">🐢 Yavaş</button></div></div>`;
  if (m.words && m.words.length) html += `<div class="words-new">📌 ${m.words.map((w) => `<b>${esc(w.word)}</b> — ${esc(w.meaning)}`).join('<br>')}</div>`;
  return html;
}
function renderMessages(extra = '') {
  $('messages').innerHTML = chat.messages.map(bubble).join('') + extra;
  $('messages').scrollTop = $('messages').scrollHeight;
}
$('messages').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.say) speak(b.dataset.say);
  if (b.dataset.sayI) speak(chat.messages[+b.dataset.sayI].content);
  if (b.dataset.slowI) speak(chat.messages[+b.dataset.slowI].content, 0.7);
  if (b.dataset.retry !== undefined) askAi();
});

let busy = false;
async function askAi() {
  busy = true;
  renderMessages('<div class="msg ai typing"><i></i><i></i><i></i></div>');
  try {
    const r = await callApi('chat', apiMessages(), chat.scenario, chat.level);
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) lastUser.fixes = Array.isArray(r.corrections) ? r.corrections : [];
    const words = Array.isArray(r.new_words) ? r.new_words : [];
    chat.messages.push({ role: 'assistant', content: String(r.reply || ''), words, hint: r.hint || '' });
    addWords(words);
    renderMessages();
    $('hint-bar').hidden = !r.hint; $('hint-text').hidden = true; $('hint-text').textContent = r.hint || '';
    saveChat();
    if (S.autoSpeak) speak(r.reply);
  } catch (err) {
    renderMessages(`<div class="err">${esc(err.message)}<br><button data-retry>Yenidən cəhd et</button></div>`);
  }
  busy = false;
}

function send() {
  const text = $('input').value.trim();
  if (!text || busy) return;
  stopSpeaking();
  addPractice();
  // A failed request leaves the user's turn last; retrying resends it instead of doubling it.
  const last = chat.messages[chat.messages.length - 1];
  if (last && last.role === 'user') last.content += `\n${text}`;
  else chat.messages.push({ role: 'user', content: text });
  $('input').value = ''; autoGrow();
  askAi();
}
$('send').addEventListener('click', send);
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
function autoGrow() { const t = $('input'); t.style.height = 'auto'; t.style.height = `${Math.min(120, t.scrollHeight)}px`; }
$('input').addEventListener('input', autoGrow);
$('hint-btn').addEventListener('click', () => { $('hint-text').hidden = false; speak($('hint-text').textContent); });

function saveChat() {
  if (!chat || !chat.messages.some((m) => m.role === 'user')) return;
  const entry = { id: chat.id, at: chat.startedAt, scenario: chat.scenario, level: chat.level, messages: chat.messages, feedback: chat.feedback || null };
  const i = S.history.findIndex((h) => h.id === chat.id);
  if (i >= 0) S.history[i] = entry; else S.history.unshift(entry);
  S.history = S.history.slice(0, 50);
  save();
}

$('chat-back').addEventListener('click', () => { stopAll(); addPractice(); lastActive = 0; saveChat(); show('home'); });

$('chat-finish').addEventListener('click', async () => {
  if (!chat.messages.some((m) => m.role === 'user')) { toast('Əvvəlcə bir az danış 🙂'); return; }
  stopAll(); addPractice(); lastActive = 0;
  $('fb-sub').textContent = $('chat-title').textContent;
  $('feedback').innerHTML = '<div class="empty"><span>⏳</span>Söhbətin təhlil olunur…</div>';
  show('feedback');
  try {
    chat.feedback = await callApi('feedback', apiMessages(), chat.scenario, chat.level);
    saveChat();
    renderFeedback(chat.feedback);
  } catch (err) {
    $('feedback').innerHTML = `<div class="empty"><span>⚠️</span>${esc(err.message)}</div>`;
  }
});

function renderFeedback(f) {
  const list = (a) => (Array.isArray(a) ? a : []).map((x) => `<li>${esc(x)}</li>`).join('');
  $('feedback').innerHTML = `
    <div class="level-big">Təxmini səviyyən: <b>${esc(f.level_estimate || '?')}</b></div>
    <div class="scores">
      <div class="score"><b>${+f.fluency || 0}</b><span>Axıcılıq</span></div>
      <div class="score"><b>${+f.grammar || 0}</b><span>Qrammatika</span></div>
      <div class="score"><b>${+f.vocabulary || 0}</b><span>Söz ehtiyatı</span></div>
    </div>
    <p>${esc(f.summary || '')}</p>
    <div class="fb-sec"><h3>👍 Yaxşı alınanlar</h3><ul>${list(f.strengths)}</ul></div>
    <div class="fb-sec"><h3>🎯 Üzərində işlə</h3><ul>${list(f.improve)}</ul></div>
    <div class="fb-sec"><h3>🗣 Bu ifadələri məşq et</h3>${(f.practice || []).map((p) => `<div class="phrase"><span>${esc(p)}</span><button class="say" data-say="${esc(String(p).split(' — ')[0])}">🔊</button></div>`).join('')}</div>
    <button class="btn" id="fb-again">Yenə danış</button>`;
}
$('feedback').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.say) speak(b.dataset.say);
  if (b.id === 'fb-again') startChat(chat ? chat.scenario : 'free');
});
$('fb-back').addEventListener('click', () => show('home'));

// ---------- words ----------
function addWords(list) {
  for (const w of list) {
    if (!w || !w.word) continue;
    if (S.words.some((x) => x.word.toLowerCase() === String(w.word).toLowerCase())) continue;
    S.words.unshift({ word: String(w.word), meaning: String(w.meaning || ''), at: Date.now() });
  }
  S.words = S.words.slice(0, 500); save();
}
function renderWords() {
  $('words-count').textContent = S.words.length ? `${S.words.length} söz` : '';
  $('words').innerHTML = S.words.length
    ? S.words.map((w, i) => `<div class="word"><button class="say" data-say="${esc(w.word)}">🔊</button><div><b>${esc(w.word)}</b><p>${esc(w.meaning)}</p></div><button class="del" data-del="${i}" aria-label="Sil">✕</button></div>`).join('')
    : '<div class="empty"><span>📚</span>Söhbətlərdə rast gəldiyin yeni sözlər burada toplanacaq.</div>';
}
$('words').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.say) speak(b.dataset.say);
  if (b.dataset.del !== undefined) { S.words.splice(+b.dataset.del, 1); save(); renderWords(); }
});

// ---------- history ----------
function renderHistory() {
  $('history').innerHTML = S.history.length
    ? S.history.map((h, i) => {
      const sc = SCENARIOS.find((s) => s.id === h.scenario) || SCENARIOS[0];
      const n = h.messages.filter((m) => m.role === 'user').length;
      const f = h.feedback;
      const score = f ? `<span class="sc">${Math.round(((+f.fluency || 0) + (+f.grammar || 0) + (+f.vocabulary || 0)) / 3 * 10) / 10}</span>` : '';
      return `<button class="hist" data-h="${i}"><div><b>${sc.e} ${sc.t}</b><small>${new Date(h.at).toLocaleDateString('az')} · ${h.level} · ${n} cavab</small></div>${score}</button>`;
    }).join('')
    : '<div class="empty"><span>🕘</span>Hələ söhbət yoxdur. Əsas səhifədən bir mövzu seç.</div>';
}
$('history').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const h = S.history[+b.dataset.h];
  chat = { id: h.id, scenario: h.scenario, level: h.level, messages: h.messages, startedAt: h.at, feedback: h.feedback };
  const sc = SCENARIOS.find((s) => s.id === h.scenario) || SCENARIOS[0];
  $('chat-title').textContent = `${sc.e} ${sc.t}`;
  $('chat-sub').textContent = `Səviyyə ${h.level}`;
  $('hint-bar').hidden = true;
  lastActive = Date.now();
  show('chat'); renderMessages();
  if (chat.messages[chat.messages.length - 1].role === 'user') renderMessages('<div class="err">Son mesaja cavab gəlmədi.<br><button data-retry>Yenidən cəhd et</button></div>');
});

// ---------- speech out ----------
const synth = window.speechSynthesis;
let voices = [];
function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const rank = (v) => (/en[-_]US/i.test(v.lang) ? 0 : /en[-_]GB/i.test(v.lang) ? 1 : 2) - (/natural|neural|premium|enhanced|google/i.test(v.name) ? 0.5 : 0);
  voices.sort((a, b) => rank(a) - rank(b));
  if ($('screen-settings').classList.contains('active')) renderSettings();
}
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
function pickVoice() { return voices.find((v) => v.voiceURI === S.voice) || voices[0] || null; }
function speak(text, rate) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(String(text));
  const v = pickVoice(); if (v) u.voice = v;
  u.lang = v ? v.lang : 'en-US';
  u.rate = rate || S.rate;
  synth.speak(u);
}
function stopSpeaking() { if (synth) synth.cancel(); }
// iOS only lets a page speak after it has spoken once inside a tap.
let unlocked = false;
function unlockSpeech() {
  if (unlocked || !synth) return; unlocked = true;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u);
}

// ---------- speech in ----------
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null; let recText = ''; let listening = false;
function startListening() {
  if (!Rec) { toast('Bu brauzer səsi tanımır. Klaviaturadakı mikrofonla (dil: English) danış və ya yaz.', 4200); $('input').focus(); return; }
  if (busy) return;
  stopSpeaking();
  rec = new Rec();
  rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
  const base = $('input').value.trim();
  recText = '';
  rec.onresult = (e) => {
    let finalText = ''; let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
    }
    recText = (finalText + interim).trim();
    $('input').value = [base, recText].filter(Boolean).join(' '); autoGrow();
    $('listening-text').textContent = recText ? 'Dinləyirəm… (bitirmək üçün yenidən toxun)' : 'Dinləyirəm…';
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Mikrofona icazə ver: brauzer ayarları → Mikrofon.', 4000);
    else if (e.error === 'no-speech') toast('Səs eşidilmədi. Yenidən cəhd et.');
    else if (e.error === 'network') toast('Səs tanıma üçün internet lazımdır.');
  };
  rec.onend = () => {
    const had = listening; setListening(false);
    if (had && S.autoSend && recText) send();
  };
  try { rec.start(); setListening(true); } catch (e) { setListening(false); }
}
function stopListening() { if (rec && listening) { try { rec.stop(); } catch (e) { setListening(false); } } }
function setListening(on) {
  listening = on;
  $('mic').classList.toggle('on', on);
  $('listening').hidden = !on;
  if (on) $('listening-text').textContent = 'Dinləyirəm…';
}
function stopAll() { if (rec) { listening = false; try { rec.abort(); } catch (e) { /* not started */ } setListening(false); } stopSpeaking(); }
$('mic').addEventListener('click', () => { unlockSpeech(); if (listening) stopListening(); else startListening(); });

// ---------- settings ----------
function renderSettings() {
  $('set-passcode').value = S.passcode;
  $('set-explain').value = S.explain;
  $('set-goal').value = String(S.goal);
  $('set-rate').value = String(S.rate); $('rate-val').textContent = `${S.rate.toFixed(2)}×`;
  $('set-autospeak').checked = S.autoSpeak;
  $('set-autosend').checked = S.autoSend;
  $('set-voice').innerHTML = voices.length
    ? voices.map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')
    : '<option value="">Sistem səsi</option>';
  const v = pickVoice(); if (v) $('set-voice').value = v.voiceURI;
  $('mic-note').textContent = Rec ? '' : 'ℹ️ Bu brauzerdə səs tanıma yoxdur. Android-də Chrome, iPhone-da Safari istifadə et, ya da klaviaturanın mikrofon düyməsi ilə danış.';
}
$('set-passcode').addEventListener('change', (e) => { S.passcode = e.target.value.trim(); save(); toast('Yadda saxlandı'); });
$('set-explain').addEventListener('change', (e) => { S.explain = e.target.value; save(); });
$('set-goal').addEventListener('change', (e) => { S.goal = +e.target.value; save(); });
$('set-rate').addEventListener('input', (e) => { S.rate = +e.target.value; $('rate-val').textContent = `${S.rate.toFixed(2)}×`; save(); });
$('set-voice').addEventListener('change', (e) => { S.voice = e.target.value; save(); speak('Hi! Let\'s practise English together.'); });
$('set-autospeak').addEventListener('change', (e) => { S.autoSpeak = e.target.checked; save(); });
$('set-autosend').addEventListener('change', (e) => { S.autoSend = e.target.checked; save(); });
$('test-voice').addEventListener('click', () => { unlockSpeech(); speak('Hi! I am your English partner. How was your day?'); });
$('reset').addEventListener('click', () => {
  if (!confirm('Bütün söhbətlər, sözlər və irəliləyiş silinsin?')) return;
  S = defaults(); save(); show('home'); toast('Silindi');
});

// ---------- install ----------
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; $('install-btn').hidden = false; });
$('install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice.catch(() => null);
  installPrompt = null; $('install-btn').hidden = true;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopAll(); if (chat && lastActive) { addPractice(); lastActive = 0; } }
  else if ($('screen-chat').classList.contains('active')) lastActive = Date.now();
  if (!document.hidden) renderToday();
});

show('home');
