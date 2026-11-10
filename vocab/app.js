/* 學測單字卡 L4–6：間隔複習（簡化 SM-2）＋快速篩選＋發音 */
(function () {
  'use strict';
  var KEY = 'gsat-vocab-v1';
  var DONE_IV = 21;              // 間隔 ≥ 21 天視為已熟記
  var W = [];                    // [{k,w,ipa,d,lv,ex,exz}]
  var S = load();                // {cards:{k:{iv,ef,reps,due,lapses}}, levels:[4,5,6], daily:{day,newDone}, set:{...}}
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 日期（以本地日期為單位） ----------
  function today() { var d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  function fmtDay(n) { var d = new Date(n * 86400000); return d.toISOString().slice(0, 10); }

  // ---------- 儲存 ----------
  function blank() {
    return { cards: {}, levels: [4, 5, 6], daily: { day: today(), newDone: 0 }, seed: newSeed(),
      set: { newPerDay: 20, voice: '', rate: 0.9, auto: true, exAuto: false } };
  }
  function newSeed() { return Math.floor(Math.random() * 4294967296); }
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    var b = blank();
    if (!s || typeof s !== 'object') return b;
    s.cards = s.cards || {}; s.levels = s.levels || b.levels;
    s.daily = s.daily || b.daily; s.set = Object.assign(b.set, s.set || {});
    if (typeof s.seed !== 'number') s.seed = b.seed;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('無法儲存進度（瀏覽器封鎖了儲存空間）'); } }
  function rollDay() { if (S.daily.day !== today()) { S.daily = { day: today(), newDone: 0 }; save(); } }

  // ---------- 資料 ----------
  function fixIpa(s) { return s ? '[' + s.replace(/!/g, 'ḷ') + ']' : ''; }
  // 新字的出場順序：依 seed 打散（固定不變，重新整理也一樣），避免同字首連在一起
  function rank(k) {
    var h = (S.seed ^ 0x811c9dc5) >>> 0;
    for (var i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return h >>> 0;
  }
  function byRank(a, b) { return rank(a.k) - rank(b.k); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function inLv(w) { return S.levels.indexOf(w.lv) >= 0; }
  function stateOf(w) {
    var c = S.cards[w.k];
    if (!c) return 'new';
    if (c.due <= today()) return 'due';
    if (c.iv >= DONE_IV) return 'done';
    return 'learn';
  }

  // ---------- 間隔排程 ----------
  function nextOf(c, g) {
    c = c ? Object.assign({}, c) : { iv: 0, ef: 2.5, reps: 0, lapses: 0, due: today() };
    if (g === 0) { c.reps = 0; c.iv = 0; c.lapses++; c.ef = Math.max(1.3, c.ef - 0.2); }
    else if (g === 1) { c.iv = c.reps === 0 ? 1 : Math.max(c.iv + 1, Math.round(c.iv * 1.2)); c.ef = Math.max(1.3, c.ef - 0.15); c.reps++; }
    else if (g === 2) { c.iv = c.reps === 0 ? 2 : c.reps === 1 ? 4 :Math.max(c.iv + 1, Math.round(c.iv * c.ef)); c.reps++; }
    else { c.iv = c.reps === 0 ? 4 : Math.max(c.iv + 2, Math.round(c.iv * c.ef * 1.3)); c.ef = Math.min(3.0, c.ef + 0.15); c.reps++; }
    c.due = today() + c.iv;
    return c;
  }
  function ivLabel(n) { return n === 0 ? '稍後再考' : n === 1 ? '明天' : n < 30 ? n + ' 天後' : n < 365 ? Math.round(n / 30) + ' 個月後' : Math.round(n / 365 * 10) / 10 + ' 年後'; }

  // ---------- 發音 ----------
  var synth = window.speechSynthesis || null, voices = [];
  // iPhone 的趣味語音（Albert、Bells…）不適合學發音，從清單拿掉
  var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ)\b/i;
  if (S.set.voiceV !== 2) { S.set.voice = ''; S.set.voiceV = 2; }   // 舊版預設可能選到怪語音，重設成「自動」
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang) && !NOVELTY.test(v.name); });
    var sel = $('set-voice'); if (!sel) return;
    sel.innerHTML = '<option value="">自動（裝置預設英文語音）</option>';
    voices.forEach(function (v) {
      var o = document.createElement('option'); o.value = v.name; o.textContent = v.name + '（' + v.lang + '）'; sel.appendChild(o);
    });
    sel.value = voices.some(function (v) { return v.name === S.set.voice; }) ? S.set.voice : '';
  }
  // iPhone Safari：第一次發聲必須發生在點擊裡，先在第一次點擊時用靜音句子「解鎖」
  var unlocked = false;
  function unlock() {
    if (unlocked || !synth) return; unlocked = true;
    var u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'en-US';
    try { synth.speak(u); } catch (e) {}
  }
  ['touchend', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, true); });
  function speak(text) {
    if (!synth) { toast('這個瀏覽器不支援語音朗讀'); return; }
    unlock();
    var u = new SpeechSynthesisUtterance(text.replace(/\s*\/\s*/g, ', ').replace(/\(s\)/g, ''));
    u.lang = 'en-US'; u.rate = S.set.rate;
    var v = S.set.voice && voices.find(function (x) { return x.name === S.set.voice; }); if (v) { u.voice = v; u.lang = v.lang; }
    var busy = synth.speaking || synth.pending;
    if (busy) synth.cancel();
    if (synth.paused) synth.resume();
    // Safari 在 cancel() 之後立刻 speak() 常會吞掉這一句，稍等一下再唸
    if (busy) setTimeout(function () { synth.speak(u); }, 120); else synth.speak(u);
  }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

  // ---------- 畫面切換 ----------
  var views = ['home', 'card', 'done', 'list', 'settings'];
  function show(v) {
    views.forEach(function (x) { $('v-' + x).hidden = x !== v; });
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var on = a.dataset.nav === v || (v !== 'list' && v !== 'settings' && a.dataset.nav === 'home');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }
  function route() {
    if (!W.length) return;
    rollDay();
    var h = location.hash.slice(1) || 'home';
    if (h === 'review') startSession('review');
    else if (h === 'triage') startSession('triage');
    else if (h === 'list') { show('list'); renderList(true); }
    else if (h === 'settings') { show('settings'); renderSettings(); }
    else { show('home'); renderHome(); }
  }

  // ---------- 今日 ----------
  function counts() {
    var t = today(), due = 0, nw = 0, learn = 0, done = 0, tot = 0;
    W.forEach(function (w) {
      if (!inLv(w)) return; tot++;
      var c = S.cards[w.k];
      if (!c) { nw++; return; }
      if (c.due <= t) due++;
      if (c.iv >= DONE_IV) done++; else learn++;
    });
    return { due: due, nw: nw, learn: learn, done: done, tot: tot, newLeft: Math.max(0, Math.min(nw, S.set.newPerDay - S.daily.newDone)) };
  }
  function renderHome() {
    var c = counts();
    $('today-label').textContent = fmtDay(today()) + ' · 每天新字 ' + S.set.newPerDay + ' 個';
    $('s-due').textContent = c.due; $('s-new').textContent = c.newLeft; $('s-learn').textContent = c.learn; $('s-done').textContent = c.done;
    var seen = c.tot - c.nw;
    $('p-bar').style.width = (c.tot ? seen / c.tot * 100 : 0) + '%';
    $('p-text').textContent = '已接觸 ' + seen + ' / ' + c.tot + ' 字，其中 ' + c.done + ' 字已熟記。';
    document.querySelectorAll('.lv').forEach(function (b) { b.setAttribute('aria-pressed', S.levels.indexOf(+b.dataset.lv) >= 0); });
    var go = $('go-review');
    go.textContent = (c.due + c.newLeft) ? '開始複習（' + (c.due + c.newLeft) + ' 張）' : '今天沒有要複習的字';
    $('go-triage').textContent = c.nw ? '快速篩選還沒看過的字（' + c.nw + '）' : '所有字都篩選過了';
  }
  document.querySelectorAll('.lv').forEach(function (b) {
    b.addEventListener('click', function () {
      var lv = +b.dataset.lv, i = S.levels.indexOf(lv);
      if (i >= 0) { if (S.levels.length === 1) { toast('至少要選一個級別'); return; } S.levels.splice(i, 1); }
      else S.levels.push(lv);
      S.levels.sort(); save(); renderHome();
    });
  });

  // ---------- 複習 / 篩選 ----------
  var Q = [], mode = 'review', cur = null, revealed = false, total = 0, doneN = 0;
  function startSession(m, extraNew) {
    mode = m; Q = []; doneN = 0;
    var t = today();
    if (m === 'triage') {
      Q = W.filter(function (w) { return inLv(w) && !S.cards[w.k]; }).sort(byRank);
    } else {
      // 到期的字：先打散，再依到期日排（越久沒複習越前面），同一天到期的順序就是隨機的
      var due = shuffle(W.filter(function (w) { var c = S.cards[w.k]; return inLv(w) && c && c.due <= t; }))
        .sort(function (a, b) { return S.cards[a.k].due - S.cards[b.k].due; });
      var cnt = counts();
      var n = extraNew || cnt.newLeft;
      var fresh = W.filter(function (w) { return inLv(w) && !S.cards[w.k]; }).sort(byRank).slice(0, n);
      fresh.forEach(function (w) { w._new = true; });
      Q = interleave(due, fresh);
    }
    total = Q.length;
    if (!total) { finish(); return; }
    show('card'); next();
  }
  function interleave(a, b) { // 每 3 張舊字插 1 張新字
    var out = [], i = 0, j = 0;
    while (i < a.length || j < b.length) {
      for (var k = 0; k < 3 && i < a.length; k++) out.push(a[i++]);
      if (j < b.length) out.push(b[j++]);
    }
    return out;
  }
  function next() {
    cur = Q.shift();
    if (!cur) { finish(); return; }
    revealed = false;
    var card = $('card'); card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
    $('c-mode').textContent = mode === 'triage' ? '快速篩選' : '複習';
    $('c-count').textContent = mode === 'triage' ? (doneN + 1) + ' / ' + total : '剩 ' + (Q.length + 1);
    $('c-lv').textContent = 'L' + cur.lv;
    var st = stateOf(cur);
    $('c-state').textContent = mode === 'triage' ? '未篩選' : st === 'new' || cur._new ? '新字' : '複習';
    $('c-word').textContent = cur.w;
    $('c-ipa').textContent = fixIpa(cur.ipa);
    $('c-def').textContent = cur.d;
    $('c-ex').innerHTML = highlight(cur.ex, cur.w);
    $('c-exz').textContent = cur.exz;
    $('c-back').hidden = true;
    $('grades').hidden = true;
    $('triage-btns').hidden = mode !== 'triage';
    $('reveal').hidden = mode === 'triage';
    $('hint').textContent = mode === 'triage' ? '只憑直覺，2 秒內決定。點卡片可以看答案。' : '先在心裡想意思，再翻開答案。';
    if (S.set.auto) speak(cur.w);
  }
  function reveal() {
    if (!cur || revealed) return;
    revealed = true;
    $('c-back').hidden = false;
    if (mode === 'review') {
      $('reveal').hidden = true; $('grades').hidden = false;
      var c = S.cards[cur.k];
      for (var g = 0; g < 4; g++) $('n' + g).textContent = ivLabel(nextOf(c, g).iv);
      $('hint').textContent = '鍵盤：1 忘了・2 模糊・3 記得・4 很熟';
    }
    if (S.set.exAuto) speak(cur.ex);
  }
  function grade(g) {
    if (!cur || !revealed) return;
    var wasNew = !S.cards[cur.k];
    S.cards[cur.k] = nextOf(S.cards[cur.k], g);
    if (wasNew) S.daily.newDone++;
    if (g === 0) Q.splice(Math.min(3, Q.length), 0, cur); // 這一輪稍後再考
    else { delete cur._new; doneN++; }
    save(); next();
  }
  function triage(t) {
    if (!cur) return;
    if (t === 2) S.cards[cur.k] = { iv: DONE_IV, ef: 2.6, reps: 2, lapses: 0, due: today() + DONE_IV };
    else S.cards[cur.k] = { iv: 0, ef: t === 0 ? 2.3 : 2.5, reps: 0, lapses: 0, due: today() };
    doneN++; save(); next();
  }
  function finish() {
    show('done');
    var c = counts();
    if (mode === 'triage') {
      $('d-title').textContent = '篩選完成';
      $('d-text').textContent = '不確定和不認得的字已排進今天的複習，按「開始複習」就能開始背。';
      $('more-new').hidden = true;
    } else {
      $('d-title').textContent = total ? '今天的份量完成了' : '今天沒有到期的字';
      $('d-text').textContent = '這一輪複習了 ' + doneN + ' 張。明天再回來，系統會告訴你哪些字該複習。';
      $('more-new').hidden = !c.nw;
    }
  }
  $('reveal').addEventListener('click', reveal);
  $('card').addEventListener('click', function (e) { if (!e.target.closest('.say')) reveal(); });
  $('grades').addEventListener('click', function (e) { var b = e.target.closest('[data-g]'); if (b) grade(+b.dataset.g); });
  $('triage-btns').addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) triage(+b.dataset.t); });
  $('say-word').addEventListener('click', function () { if (cur) speak(cur.w); });
  $('say-ex').addEventListener('click', function () { if (cur) speak(cur.ex); });
  $('more-new').addEventListener('click', function () { startSession('review', 10); });
  document.addEventListener('keydown', function (e) {
    if ($('v-card').hidden || e.target.matches('input,select,textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!revealed && mode === 'review') reveal(); return; }
    if (mode === 'review' && revealed && /^[1-4]$/.test(e.key)) grade(+e.key - 1);
    if (mode === 'triage' && /^[1-3]$/.test(e.key)) triage(+e.key - 1);
    if (e.key === 'p' || e.key === 'P') speak(cur.w);
  });
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function highlight(sen, word) {
    var bases = word.split('/').map(function (x) { return x.replace(/\(.*?\)/g, '').trim(); }).filter(Boolean);
    var out = esc(sen);
    for (var i = 0; i < bases.length; i++) {
      var b = bases[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var stem = bases[i].length > 4 && /e$/.test(bases[i]) ? b.slice(0, -1) : b;
      var re = new RegExp('\\b(' + stem + '[a-z]*)', 'i');
      if (re.test(out)) return out.replace(re, '<mark>$1</mark>');
    }
    return out;
  }

  // ---------- 單字表 ----------
  var listShown = 0, listRows = [];
  function renderList(reset) {
    if (reset) {
      var q = $('q').value.trim().toLowerCase(), lv = $('f-lv').value, st = $('f-st').value;
      listRows = W.filter(function (w) {
        if (lv && w.lv !== +lv) return false;
        if (st && stateOf(w) !== st) return false;
        if (q && w.w.toLowerCase().indexOf(q) < 0 && w.d.indexOf(q) < 0) return false;
        return true;
      });
      listShown = 0; $('list').innerHTML = '';
      $('l-count').textContent = '共 ' + listRows.length + ' 字';
    }
    var frag = document.createDocumentFragment(), labels = { new: '還沒學', learn: '學習中', due: '今天到期', done: '已熟記' };
    listRows.slice(listShown, listShown + 100).forEach(function (w) {
      var st = stateOf(w), c = S.cards[w.k];
      var li = document.createElement('li');
      li.innerHTML = '<span class="w">' + esc(w.w) + '<small>L' + w.lv + ' ' + esc(fixIpa(w.ipa)) + '</small></span>' +
        '<span class="d">' + esc(w.d) + '</span>' +
        '<span class="r"><span class="pill ' + st + '" title="' + (c ? '下次：' + fmtDay(c.due) : '') + '">' + labels[st] + '</span>' +
        '<button class="say small" aria-label="唸出 ' + esc(w.w) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/></svg></button></span>';
      li.querySelector('button').addEventListener('click', function () { speak(w.w); });
      frag.appendChild(li);
    });
    listShown += 100;
    $('list').appendChild(frag);
    $('l-more').hidden = listShown >= listRows.length;
  }
  var tq; $('q').addEventListener('input', function () { clearTimeout(tq); tq = setTimeout(function () { renderList(true); }, 200); });
  $('f-lv').addEventListener('change', function () { renderList(true); });
  $('f-st').addEventListener('change', function () { renderList(true); });
  $('l-more').addEventListener('click', function () { renderList(false); });

  // ---------- 設定 ----------
  function renderSettings() {
    $('set-new').value = S.set.newPerDay; $('set-new-o').textContent = S.set.newPerDay;
    $('set-rate').value = S.set.rate; $('set-rate-o').textContent = S.set.rate.toFixed(1);
    $('set-auto').checked = S.set.auto; $('set-exauto').checked = S.set.exAuto;
    $('total-n').textContent = W.length; $('reset-confirm').hidden = true; $('io-msg').textContent = '';
    loadVoices();
  }
  $('set-new').addEventListener('input', function (e) { S.set.newPerDay = +e.target.value; $('set-new-o').textContent = e.target.value; save(); });
  $('set-rate').addEventListener('input', function (e) { S.set.rate = +e.target.value; $('set-rate-o').textContent = (+e.target.value).toFixed(1); save(); });
  $('set-voice').addEventListener('change', function (e) { S.set.voice = e.target.value; save(); speak('pronunciation'); });
  $('set-auto').addEventListener('change', function (e) { S.set.auto = e.target.checked; save(); });
  $('set-exauto').addEventListener('change', function (e) { S.set.exAuto = e.target.checked; save(); });
  $('test-voice').addEventListener('click', function () { speak('Practice makes perfect.'); });
  $('export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ app: KEY, exported: new Date().toISOString(), data: S })], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gsat-vocab-backup-' + fmtDay(today()) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $('io-msg').textContent = '已匯出 ' + Object.keys(S.cards).length + ' 個字的進度。';
  });
  $('import').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result); var d = j.data || j;
        if (!d.cards || typeof d.cards !== 'object') throw new Error();
        var b = blank(); S = { cards: d.cards, levels: d.levels || b.levels, daily: d.daily || b.daily, set: Object.assign(b.set, d.set || {}), seed: typeof d.seed === 'number' ? d.seed : S.seed };
        save(); $('io-msg').textContent = '匯入完成：' + Object.keys(S.cards).length + ' 個字的進度。';
      } catch (err) { $('io-msg').textContent = '這個檔案不是單字卡的備份檔，請重新選擇。'; }
      e.target.value = '';
    };
    r.readAsText(f);
  });
  $('reset').addEventListener('click', function () { $('reset-n').textContent = Object.keys(S.cards).length; $('reset-confirm').hidden = false; });
  $('reset-no').addEventListener('click', function () { $('reset-confirm').hidden = true; });
  $('reset-yes').addEventListener('click', function () { var set = S.set; S = blank(); S.set = set; save(); $('reset-confirm').hidden = true; toast('進度已清除'); });

  // ---------- 其他 ----------
  var tt; function toast(m) { var t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2200); }

  fetch('data/words.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (rows) {
    var seen = {};
    W = rows.map(function (r) {
      var base = r[3] + ':' + r[0]; seen[base] = (seen[base] || 0) + 1;
      return { k: seen[base] > 1 ? base + '#' + seen[base] : base, w: r[0], ipa: r[1], d: r[2], lv: r[3], ex: r[4], exz: r[5] };
    });
    $('loading').hidden = true;
    route();
  }).catch(function () {
    $('loading').textContent = '單字資料載入失敗。請確認 data/words.json 和這個網頁放在一起，並透過網址（例如 GitHub Pages）開啟，而不是直接雙擊檔案。';
  });
  window.addEventListener('hashchange', route);
})();
