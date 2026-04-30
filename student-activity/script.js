'use strict';

(function () {
  const STORAGE_KEY = 'worldwatch.v1';
  const TOTAL_STEPS = 7;

  const defaultState = () => ({
    topic: null,
    customTopic: '',
    sourceJudgments: {},
    factPicks: {},
    sourceScore: 0,
    factScore: 0,
    notes: { who: '', what: '', where: '', when: '', why: '', how: '', source1: '', source2: '' },
    insights: { i1: '', i2: '', i3: '' },
    checks: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false },
    currentStep: 1,
    completed: false,
  });

  let state = defaultState();
  let saveTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state = Object.assign(defaultState(), parsed);
      state.notes = Object.assign(defaultState().notes, parsed.notes || {});
      state.insights = Object.assign(defaultState().insights, parsed.insights || {});
      state.checks = Object.assign(defaultState().checks, parsed.checks || {});
      state.sourceJudgments = parsed.sourceJudgments || {};
      state.factPicks = parsed.factPicks || {};
    } catch (_) {
      state = defaultState();
    }
  }

  function persistNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* quota or private mode — ignore */ }
  }

  function persistDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 250);
  }

  // ---------- Source feedback library ----------
  const sourceFeedback = {
    credible: [
      'Reuters has named editors, dated reporting, and a public corrections policy — credible.',
      'Peer-reviewed studies (e.g., The Lancet) are vetted by other experts — credible.',
      'United Nations data dashboards publish methodology and source data — credible.',
      'Established news outlets with bylines and recent dates tend to be credible.',
    ],
    notCredible: [
      'Anonymous viral posts have no author, no date, and no editorial review — question it.',
      'Sponsored content selling a product has a profit motive — question it.',
      'Satire sites publish jokes as articles — entertaining, but question it as evidence.',
      'No author + no date + emotional language → question it.',
    ],
    fallback: 'Check author, date, source type, and intent before trusting it.',
  };

  function feedbackForSource(card, isCorrect) {
    const credible = card.dataset.credible === 'true';
    const title = ($('.source-title', card)?.textContent || '').toLowerCase();
    let msg = '';
    if (credible) {
      if (title.includes('reuters')) msg = sourceFeedback.credible[0];
      else if (title.includes('lancet') || title.includes('peer')) msg = sourceFeedback.credible[1];
      else if (title.includes('un ') || title.includes('united nations') || title.includes('dashboard')) msg = sourceFeedback.credible[2];
      else msg = sourceFeedback.credible[3];
    } else {
      if (title.includes('twitter') || title.includes('viral') || title.includes('anonymous') || title.includes('x/')) msg = sourceFeedback.notCredible[0];
      else if (title.includes('sponsor') || title.includes('blog selling') || title.includes('ad')) msg = sourceFeedback.notCredible[1];
      else if (title.includes('satire')) msg = sourceFeedback.notCredible[2];
      else msg = sourceFeedback.notCredible[3];
    }
    return (isCorrect ? '✅ ' : '⚠️ ') + msg;
  }

  // ---------- Step navigation ----------
  function showStep(n) {
    n = Math.max(1, Math.min(TOTAL_STEPS, n));
    $$('.step').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
    state.currentStep = n;
    updateProgress();
    persistDebounced();
    const main = $('#app');
    if (main) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const heading = $(`#step-${n} h2`);
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      try { heading.focus({ preventScroll: true }); } catch (_) { heading.focus(); }
    }
    if (n === TOTAL_STEPS) {
      state.completed = true;
      const banner = $('#completion-banner');
      if (banner) banner.removeAttribute('hidden');
    }
    refreshGates();
  }

  function updateProgress() {
    const pct = Math.round(((state.currentStep - 1) / (TOTAL_STEPS - 1)) * 100);
    const bar = $('#progress-bar');
    const label = $('#progress-label');
    const wrap = $('#progress');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '% complete';
    if (wrap) wrap.setAttribute('aria-valuenow', String(pct));
  }

  function gateSatisfied(name) {
    switch (name) {
      case 'topic':
        return Boolean((state.topic && state.topic !== 'custom') || (state.topic === 'custom' && state.customTopic.trim()));
      case 'sources': return state.sourceScore >= 4;
      case 'facts':   return state.factScore >= 5;
      case 'notes': {
        const n = state.notes;
        const allW = ['who','what','where','when','why','how'].every(k => (n[k] || '').trim());
        const anySrc = (n.source1 || '').trim() || (n.source2 || '').trim();
        return allW && Boolean(anySrc);
      }
      case 'insights':
        return ['i1','i2','i3'].every(k => (state.insights[k] || '').trim());
      default: return true;
    }
  }

  function refreshGates() {
    $$('button.nav-next[data-requires]').forEach(btn => {
      const ok = gateSatisfied(btn.dataset.requires);
      btn.disabled = !ok;
      btn.setAttribute('aria-disabled', String(!ok));
    });
  }

  function shake(el) {
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 450);
  }

  function showNavError(btn, msg) {
    let err = btn.parentElement?.querySelector('.nav-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'nav-error';
      err.setAttribute('role', 'alert');
      btn.parentElement?.appendChild(err);
    }
    err.textContent = msg;
    clearTimeout(err._timer);
    err._timer = setTimeout(() => { err.textContent = ''; }, 4000);
  }

  function gateMessage(name) {
    switch (name) {
      case 'topic': return 'Pick a topic (or type a custom one) to continue.';
      case 'sources': return 'Get at least 4 of 6 sources right to continue.';
      case 'facts': return 'Get at least 5 of 6 statements right to continue.';
      case 'notes': return 'Fill all 5 Ws + How and at least one source.';
      case 'insights': return 'Write all three insights.';
      default: return 'Complete this step to continue.';
    }
  }

  // ---------- Topic selection ----------
  function setTopic(value, fromCustom) {
    if (fromCustom) {
      state.customTopic = value || '';
      state.topic = state.customTopic.trim() ? 'custom' : null;
      $$('.topic-card').forEach(c => c.setAttribute('aria-pressed', 'false'));
    } else {
      state.topic = value;
      state.customTopic = '';
      const ci = $('#custom-topic');
      if (ci) ci.value = '';
      $$('.topic-card').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.topic === value)));
    }
    const display = $('#selected-topic-display');
    if (display) {
      if (state.topic === 'custom') display.textContent = state.customTopic.trim() || 'custom topic';
      else if (state.topic) {
        const card = $(`.topic-card[data-topic="${CSS.escape(state.topic)}"]`);
        display.textContent = card ? ($('.topic-title', card)?.textContent || state.topic) : state.topic;
      } else {
        display.textContent = 'none yet';
      }
    }
    persistDebounced();
    refreshGates();
  }

  // ---------- Source Sleuth ----------
  function judgeSource(card, judge) {
    const cards = $$('.source-card');
    const idx = cards.indexOf(card);
    state.sourceJudgments[idx] = judge;
    const correct = (judge === 'credible' && card.dataset.credible === 'true') ||
                    (judge === 'question' && card.dataset.credible === 'false');
    card.classList.toggle('judged-correct', correct);
    card.classList.toggle('judged-wrong', !correct);
    $$('.source-judge', card).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.judge === judge)));
    const fb = $('.source-feedback', card);
    if (fb) {
      fb.textContent = feedbackForSource(card, correct);
      fb.removeAttribute('hidden');
    }
    state.sourceScore = $$('.source-card.judged-correct').length;
    const scoreEl = $('#source-score');
    if (scoreEl) scoreEl.textContent = String(state.sourceScore);
    persistDebounced();
    refreshGates();
  }

  function rehydrateSources() {
    const cards = $$('.source-card');
    cards.forEach((card, idx) => {
      const judge = state.sourceJudgments[idx];
      if (!judge) return;
      const correct = (judge === 'credible' && card.dataset.credible === 'true') ||
                      (judge === 'question' && card.dataset.credible === 'false');
      card.classList.toggle('judged-correct', correct);
      card.classList.toggle('judged-wrong', !correct);
      $$('.source-judge', card).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.judge === judge)));
      const fb = $('.source-feedback', card);
      if (fb) {
        fb.textContent = feedbackForSource(card, correct);
        fb.removeAttribute('hidden');
      }
    });
    state.sourceScore = $$('.source-card.judged-correct').length;
    const scoreEl = $('#source-score');
    if (scoreEl) scoreEl.textContent = String(state.sourceScore);
  }

  // ---------- Fact vs Opinion ----------
  function pickFact(li, pick) {
    const items = $$('.statement');
    const idx = items.indexOf(li);
    state.factPicks[idx] = pick;
    const correct = pick === li.dataset.type;
    li.classList.toggle('judged-correct', correct);
    li.classList.toggle('judged-wrong', !correct);
    $$('button[data-pick]', li).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === pick)));
    const fb = $('.statement-feedback', li);
    if (fb) {
      fb.textContent = (correct ? '✅ ' : '⚠️ ') +
        (li.dataset.type === 'fact' ? 'Verifiable with evidence.' : 'Reflects a belief or value judgment.');
      fb.removeAttribute('hidden');
    }
    state.factScore = $$('.statement.judged-correct').length;
    const scoreEl = $('#fact-score');
    if (scoreEl) scoreEl.textContent = String(state.factScore);
    persistDebounced();
    refreshGates();
  }

  function rehydrateFacts() {
    const items = $$('.statement');
    items.forEach((li, idx) => {
      const pick = state.factPicks[idx];
      if (!pick) return;
      const correct = pick === li.dataset.type;
      li.classList.toggle('judged-correct', correct);
      li.classList.toggle('judged-wrong', !correct);
      $$('button[data-pick]', li).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === pick)));
      const fb = $('.statement-feedback', li);
      if (fb) {
        fb.textContent = (correct ? '✅ ' : '⚠️ ') +
          (li.dataset.type === 'fact' ? 'Verifiable with evidence.' : 'Reflects a belief or value judgment.');
        fb.removeAttribute('hidden');
      }
    });
    state.factScore = $$('.statement.judged-correct').length;
    const scoreEl = $('#fact-score');
    if (scoreEl) scoreEl.textContent = String(state.factScore);
  }

  // ---------- Notes ----------
  const NOTE_FIELDS = ['who','what','where','when','why','how'];
  const SOURCE_FIELDS = [['source-1','source1'], ['source-2','source2']];

  function bindNotes() {
    NOTE_FIELDS.forEach(name => {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return;
      el.value = state.notes[name] || '';
      updateWordCount(name, el.value);
      el.addEventListener('input', () => {
        state.notes[name] = el.value;
        updateWordCount(name, el.value);
        persistDebounced();
        refreshGates();
      });
    });
    SOURCE_FIELDS.forEach(([htmlName, key]) => {
      const el = document.querySelector(`[name="${htmlName}"]`);
      if (!el) return;
      el.value = state.notes[key] || '';
      el.addEventListener('input', () => {
        state.notes[key] = el.value;
        persistDebounced();
        refreshGates();
      });
    });
  }

  function updateWordCount(name, value) {
    const span = document.querySelector(`.word-count[data-for="${name}"]`);
    if (!span) return;
    const words = (value || '').trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
    span.textContent = words + (words === 1 ? ' word' : ' words');
  }

  // ---------- Insights ----------
  const INSIGHT_FIELDS = [['insight-1','i1'], ['insight-2','i2'], ['insight-3','i3']];

  function bindInsights() {
    INSIGHT_FIELDS.forEach(([htmlName, key]) => {
      const el = document.querySelector(`[name="${htmlName}"]`);
      if (!el) return;
      el.value = state.insights[key] || '';
      updateCharCount(htmlName, el.value);
      el.addEventListener('input', () => {
        state.insights[key] = el.value;
        updateCharCount(htmlName, el.value);
        persistDebounced();
        refreshGates();
      });
    });
  }

  function updateCharCount(htmlName, value) {
    const span = document.querySelector(`.char-count[data-for="${htmlName}"]`);
    if (!span) return;
    const len = (value || '').length;
    span.textContent = `${len} / 220`;
    span.classList.toggle('char-count-warn', len >= 200);
  }

  // ---------- Step 7 actions ----------
  function topicLabel() {
    if (state.topic === 'custom') return state.customTopic.trim() || 'Custom topic';
    if (!state.topic) return '(no topic chosen)';
    const card = document.querySelector(`.topic-card[data-topic="${CSS.escape(state.topic)}"]`);
    return card ? ($('.topic-title', card)?.textContent || state.topic) : state.topic;
  }

  function buildNotesText() {
    const n = state.notes, ins = state.insights;
    const lines = [];
    lines.push('WORLD WATCH — Research Notes');
    lines.push('Generated: ' + new Date().toLocaleString());
    lines.push('');
    lines.push('Topic: ' + topicLabel());
    lines.push('');
    lines.push('5 Ws + How');
    lines.push('  Who:   ' + (n.who || ''));
    lines.push('  What:  ' + (n.what || ''));
    lines.push('  Where: ' + (n.where || ''));
    lines.push('  When:  ' + (n.when || ''));
    lines.push('  Why:   ' + (n.why || ''));
    lines.push('  How:   ' + (n.how || ''));
    lines.push('');
    lines.push('Sources');
    lines.push('  1. ' + (n.source1 || ''));
    lines.push('  2. ' + (n.source2 || ''));
    lines.push('');
    lines.push('Three Key Insights');
    lines.push('  1. ' + (ins.i1 || ''));
    lines.push('  2. ' + (ins.i2 || ''));
    lines.push('  3. ' + (ins.i3 || ''));
    lines.push('');
    lines.push('Source Sleuth score: ' + state.sourceScore + ' / 6');
    lines.push('Fact vs Opinion score: ' + state.factScore + ' / 6');
    return lines.join('\n');
  }

  function buildCanvaBrief() {
    const n = state.notes, ins = state.insights;
    return [
      'CANVA INFOGRAPHIC BRIEF',
      '',
      'Topic: ' + topicLabel(),
      'Audience: classmates and our school community',
      'Format: 1-page portrait infographic (1080 × 1350) — Canva "Infographic" preset',
      '',
      'Required elements:',
      '  • Bold title naming the global issue',
      '  • A short subtitle / hook',
      '  • Visual summary of the 5 Ws + How',
      '  • Three call-out insights',
      '  • Footer with at least 2 cited sources',
      '  • At least one chart, map, or icon set',
      '  • Your name + class period',
      '',
      'Headlines to feature (from my insights):',
      '  1. ' + (ins.i1 || ''),
      '  2. ' + (ins.i2 || ''),
      '  3. ' + (ins.i3 || ''),
      '',
      'Key facts to include (from my notes):',
      '  • Who: '   + (n.who   || ''),
      '  • What: '  + (n.what  || ''),
      '  • Where: ' + (n.where || ''),
      '  • When: '  + (n.when  || ''),
      '  • Why it matters: ' + (n.why || ''),
      '  • How / next steps: ' + (n.how || ''),
      '',
      'Sources to cite:',
      '  1. ' + (n.source1 || ''),
      '  2. ' + (n.source2 || ''),
      '',
      'Design direction:',
      '  • One accent color for emphasis; neutral background',
      '  • Sans-serif body type, larger weight for headlines',
      '  • High contrast; generous white space',
      '  • Group related items; left-to-right or top-to-bottom hierarchy',
    ].join('\n');
  }

  function buildSummary() {
    const n = state.notes, ins = state.insights;
    return [
      'World Watch summary',
      'Topic: ' + topicLabel(),
      '',
      'Three insights:',
      '  1. ' + (ins.i1 || ''),
      '  2. ' + (ins.i2 || ''),
      '  3. ' + (ins.i3 || ''),
      '',
      'Sources:',
      '  1. ' + (n.source1 || ''),
      '  2. ' + (n.source2 || ''),
    ].join('\n');
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function flashLabel(btn, tempLabel) {
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = tempLabel;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      flashLabel(btn, 'Copied ✓');
    } catch (_) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flashLabel(btn, 'Copied ✓'); }
      catch (__) { flashLabel(btn, 'Copy failed'); }
      document.body.removeChild(ta);
    }
  }

  // ---------- Checkboxes ----------
  function bindChecks() {
    for (let i = 1; i <= 8; i++) {
      const cb = document.getElementById('check-' + i);
      if (!cb) continue;
      cb.checked = Boolean(state.checks[i]);
      cb.addEventListener('change', () => {
        state.checks[i] = cb.checked;
        persistDebounced();
      });
    }
  }

  // ---------- Init ----------
  function init() {
    loadState();

    // Topic cards
    $$('.topic-card').forEach(card => {
      const t = card.dataset.topic;
      if (state.topic && state.topic === t) card.setAttribute('aria-pressed', 'true');
      card.addEventListener('click', () => setTopic(t, false));
    });
    const customInput = $('#custom-topic');
    if (customInput) {
      customInput.value = state.customTopic || '';
      customInput.addEventListener('input', () => setTopic(customInput.value, true));
    }
    // Initial topic display
    if (state.topic) setTopic(state.topic === 'custom' ? state.customTopic : state.topic, state.topic === 'custom');

    // Source Sleuth
    document.addEventListener('click', (e) => {
      const j = e.target.closest('.source-judge');
      if (j) {
        const card = j.closest('.source-card');
        if (card) judgeSource(card, j.dataset.judge);
        return;
      }
      const p = e.target.closest('button[data-pick]');
      if (p) {
        const li = p.closest('.statement');
        if (li) pickFact(li, p.dataset.pick);
        return;
      }
      const next = e.target.closest('button.nav-next');
      if (next) {
        const req = next.dataset.requires;
        if (req && !gateSatisfied(req)) {
          shake(next);
          showNavError(next, gateMessage(req));
        } else {
          const goto = Number(next.dataset.goto);
          if (goto) showStep(goto);
        }
        return;
      }
      const prev = e.target.closest('button.nav-prev');
      if (prev) {
        const goto = Number(prev.dataset.goto);
        if (goto) showStep(goto);
        return;
      }
    });

    rehydrateSources();
    rehydrateFacts();
    bindNotes();
    bindInsights();
    bindChecks();

    // Toolbar
    const resetBtn = $('#reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('This will clear your saved progress on this device. Continue?')) {
          try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
          location.reload();
        }
      });
    }
    const printBtn = $('#print-btn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    // Step 7 actions
    const exportBtn = $('#export-notes-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        downloadText('world-watch-notes.txt', buildNotesText());
      });
    }
    const copyBriefBtn = $('#copy-canva-prompt-btn');
    if (copyBriefBtn) {
      copyBriefBtn.addEventListener('click', () => copyText(buildCanvaBrief(), copyBriefBtn));
    }
    const copySumBtn = $('#copy-summary-btn');
    if (copySumBtn) {
      copySumBtn.addEventListener('click', () => copyText(buildSummary(), copySumBtn));
    }
    const launchCanva = $('#launch-canva-btn');
    if (launchCanva) {
      launchCanva.addEventListener('click', () => {
        state.completed = true;
        const banner = $('#completion-banner');
        if (banner) banner.removeAttribute('hidden');
        persistNow();
      });
    }

    // Restore step
    showStep(state.currentStep || 1);
    if (state.completed) {
      const banner = $('#completion-banner');
      if (banner) banner.removeAttribute('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
