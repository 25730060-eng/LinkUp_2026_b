'use strict';

// 화면 전환만 담당합니다. 유형 판별·JSON·저장은 이후 단계에서 추가합니다.
// 방식: 단일 HTML, 해시(#home 등)로 화면 하나만 hidden 해제 → 브라우저 뒤로가기도 동작
(function () {
  var SCREENS = ['home', 'check', 'result', 'cases', 'detail', 'saved'];
  var TAB_SCREENS = ['home', 'cases', 'saved'];       // 1단계: 탭바 표시
  var PARENT = { check: 'home', result: 'check', detail: 'cases' };     // 2단계: 뒤로가기 대상

  var tabs = document.querySelectorAll('#tabbar .tab');
  var input = document.getElementById('input-text');
  var btnCheck = document.getElementById('btn-check');
  var inputError = document.getElementById('input-error');
  var resultText = document.getElementById('result-text');
  var btnPaste = document.getElementById('btn-paste');
  var pasteFail = document.getElementById('paste-fail');
  var detailOrigin = 'cases';                           // 상세로 들어온 화면 (home, cases, saved)

  var dataReady = false;                                 // JSON을 다 불러왔는지 (상세 주소로 바로 들어올 때 필요)
  var fallbackId = '';                                   // JSON에 없는 손으로 쓴 카드(마이페이지)에서 열었을 때의 id
  var scrollMem = {};                                    // 화면별 스크롤 위치 (상세에서 돌아올 때 복원)
  var prevName = '';

  function hashParts() { return location.hash.replace('#', '').split('/'); }
  function currentName() {
    var name = hashParts()[0];
    return SCREENS.indexOf(name) === -1 ? 'home' : name;
  }
  function currentArg() { var p = hashParts(); return p[1] ? decodeURIComponent(p[1]) : ''; }

  function show(name) {
    // 입력 없이 확인 결과로 직접 들어오면 홈으로 되돌림 (원문은 저장하지 않으므로 새로고침 시 사라짐)
    if (name === 'result' && !input.value.trim()) name = 'check';

    // 상세: #detail/사례id 로 사례를 찾음. 없거나 틀린 id면 목록으로 보냄 (데이터를 불러오는 중이면 목록 화면에서 기다림)
    if (name === 'detail') {
      var id = currentArg(), item = id ? findCase(id) : null;
      if (item) { fillDetail(item); }
      else if (id && id === fallbackId) { /* 마이페이지의 손으로 쓴 카드: 클릭 때 채운 내용을 그대로 사용 */ }
      else if (!dataReady) { name = 'cases'; }
      else { location.replace('#cases'); return; }
    }

    SCREENS.forEach(function (s) {
      document.getElementById('screen-' + s).hidden = (s !== name);
    });

    // 탭 강조는 1단계 화면에서만, 2단계는 부모 탭 기준
    var tabName = TAB_SCREENS.indexOf(name) !== -1 ? name : (name === 'detail' ? detailOrigin : PARENT[name]);
    tabs.forEach(function (a) {
      if (a.dataset.tab === tabName) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    var restore = (prevName === 'detail' && scrollMem[name]) ? scrollMem[name] : 0;   // 상세에서 돌아오면 보던 위치로
    window.scrollTo(0, restore);
    prevName = name;
  }

  function go(name) {
    if (location.hash === '#' + name) show(currentName());
    else location.hash = name;                          // hashchange에서 show 호출
  }

  function goBack(fromName) {
    go(fromName === 'detail' ? detailOrigin : (PARENT[fromName] || 'home'));
  }

  window.addEventListener('hashchange', function () { show(currentName()); });

  // 입력이 있어야 버튼 활성화
  input.addEventListener('input', function () {
    btnCheck.disabled = !input.value.trim();
    if (!inputError.hidden && input.value.trim()) inputError.hidden = true;
    pasteFail.hidden = true;
  });

  // 붙여넣기 버튼: 클립보드 읽기가 막히면 기존 방법(길게 눌러 붙여넣기)을 안내
  function pasteFailed() { pasteFail.hidden = false; input.focus(); }
  btnPaste.addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { pasteFailed(); return; }
    navigator.clipboard.readText().then(function (text) {
      if (!text.trim()) { pasteFailed(); return; }
      input.value = text;
      input.dispatchEvent(new Event('input'));
    }).catch(pasteFailed);
  });

  // 유형 확인하기 → 확인 결과 (원문은 변수·저장소에 보관하지 않고 화면에만 표시)
  btnCheck.addEventListener('click', function () {
    var text = input.value.trim();
    if (!text) { inputError.hidden = false; return; }
    resultText.textContent = text;                      // textContent: 붙여넣은 문구를 HTML로 해석하지 않음
    go('result');
  });

  document.getElementById('btn-back').addEventListener('click', function () { goBack('result'); });
  document.getElementById('btn-check-back').addEventListener('click', function () { goBack('check'); });
  document.getElementById('btn-detail-back').addEventListener('click', function () { goBack('detail'); });

  // 사례 카드의 '자세히 보기'·'열기' → 사례 상세 (이벤트 위임: 카드가 나중에 생성돼도 동작)
  document.addEventListener('click', function (e) {
    var open = e.target.closest('.btn-open');
    if (!open) return;
    var from = currentName();
    detailOrigin = (from === 'saved' || from === 'home') ? from : 'cases';   // 뒤로가기 때 돌아갈 화면
    scrollMem[from] = window.scrollY;                    // 돌아올 때 이 위치로 복원
    document.getElementById('case-detail').dataset.id = open.dataset.id;

    var item = findCase(open.dataset.id);
    if (!item) {                                         // 마이페이지의 손으로 쓴 카드(아직 JSON 연결 전)는 카드 내용으로 채움
      var card = open.closest('.case-card');
      setSource(card ? (card.dataset.sourceUrl || '') : '');
      var srcEl = card && card.querySelector('.case-source');
      var dateEl = card && card.querySelector('.case-date');
      if (srcEl) document.getElementById('case-source').textContent = srcEl.textContent;
      if (dateEl) document.getElementById('case-date').textContent = dateEl.textContent;
      fallbackId = open.dataset.id;
    }
    go('detail/' + encodeURIComponent(open.dataset.id));   // 주소에 사례 id가 들어가므로 새로고침·뒤로가기가 동작
  });

  // ----- 유형 필터 (사례 목록·마이페이지 공통) -----
  // 칩(data-type)을 누르면 카드(data-type)를 거르고, 건수와 '결과 없음' 영역을 갱신
  var applyFns = {};
  function setupTypeFilter(cfg) {
    var screen = document.getElementById(cfg.screenId);
    var chips = screen.querySelectorAll('.chip[data-type]');
    var countEl = document.getElementById(cfg.countId);
    var emptyEl = document.getElementById(cfg.emptyId);
    var listEl = document.getElementById(cfg.listId);

    function apply(type) {
      var visible = 0;
      var cards = document.getElementById(cfg.listId).querySelectorAll('.case-card');   // 삭제 후에도 최신 카드 기준
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c.dataset.type === type ? 'true' : 'false');
      });
      cards.forEach(function (card) {
        var show = !type || card.dataset.type === type;
        card.hidden = !show;
        if (show) visible++;
      });
      countEl.textContent = visible;
      var none = cfg.noneId ? document.getElementById(cfg.noneId) : null;
      var empty = cards.length === 0;                  // 저장이 하나도 없을 때는 '저장 없음' 안내
      if (none) none.hidden = !empty;
      emptyEl.hidden = empty || visible !== 0;
      listEl.hidden = visible === 0;
    }
    applyFns[cfg.screenId] = function () {
      var p = screen.querySelector('.chip[data-type][aria-pressed="true"]');
      apply(p ? p.dataset.type : '');
    };

    chips.forEach(function (c) {
      c.addEventListener('click', function () { apply(c.dataset.type); });
    });
    (cfg.resetIds || []).forEach(function (id) {
      document.getElementById(id).addEventListener('click', function () { apply(''); });
    });

    var pressed = screen.querySelector('.chip[data-type][aria-pressed="true"]');
    apply(pressed ? pressed.dataset.type : '');       // 처음 표시: HTML에서 선택된 칩 기준
  }

  setupTypeFilter({ screenId: 'screen-saved', listId: 'saved-case-list', countId: 'saved-count-num',
                    emptyId: 'state-saved-filter-empty', noneId: 'state-saved-empty', resetIds: ['btn-saved-all'] });

  // 마이페이지: 휴지통 버튼으로 저장한 사례 삭제 (지금은 화면에서만 지움. 저장소 연결은 11주차)
  document.getElementById('saved-case-list').addEventListener('click', function (e) {
    var del = e.target.closest('.btn-delete');
    if (!del) return;
    var card = del.closest('.case-card');
    if (card) card.remove();
    applyFns['screen-saved']();
  });


  // =====================================================================
  // 9주차: 데이터 연결 → 점검 → 상태(state) → 결과 배열(results) → 화면(renderList)
  //   cases   : JSON에서 읽은 원본 배열 (화면에서 절대 바꾸지 않음)
  //   state   : 검색어·유형·실제 사례만·정렬 — 화면 조건은 전부 여기 하나에 모음
  //   results(): 원본에서 조건에 맞는 새 배열을 만들어 돌려줌
  // =====================================================================
  var DATA_URL = 'data/cases_all.json';
  var TYPES_URL = 'data/types.json';
  var PAGE_SIZE = 20;

  var cases = [];                                        // 원본 배열
  var types = [];                                        // [{typeId, typeName}]
  var typeName = {};                                     // typeId → 표시 이름
  var state = defaultState();
  var shown = PAGE_SIZE;                                 // 지금 화면에 보여줄 건수

  function defaultState() { return { search: '', type: '', filters: [], realOnly: true, sort: 'latest' }; }
  function $(id) { return document.getElementById(id); }
  function findCase(id) { for (var i = 0; i < cases.length; i++) if (cases[i].id === id) return cases[i]; return null; }
  function norm(t) { return String(t || '').replace(/\s/g, '').toLowerCase(); }

  // ----- 7주차 데이터 점검: 배열·건수·필드·id·필수 필드·허용값을 Console에 출력, 문제 있는 항목은 화면에서 제외 -----
  var REQUIRED = ['id', 'title', 'typeId'];
  var FIELD_TYPES = { id: 'string', title: 'string', typeId: 'string', summary: 'string', method: 'string', isReal: 'boolean' };
  function checkData(data, source, allowedTypes) {
    console.group('[데이터 점검]', source);
    console.log('배열인가?', Array.isArray(data));
    if (!Array.isArray(data)) { console.groupEnd(); return null; }
    console.log('데이터 건수:', data.length);
    console.log('첫 번째 객체의 필드:', Object.keys(data[0] || {}));
    var warn = [], seen = {}, nulls = {};
    var valid = data.filter(function (p) {
      var ok = true;
      if (seen[p.id]) { warn.push('id 중복: ' + p.id + ' → 화면에서 제외'); ok = false; }
      seen[p.id] = true;
      REQUIRED.forEach(function (k) { if (p[k] === null || p[k] === undefined || p[k] === '') { warn.push('필수 필드 누락: id ' + p.id + ' ' + k + ' → 화면에서 제외'); ok = false; } });
      Object.keys(FIELD_TYPES).forEach(function (k) {
        var v = p[k];
        if (v === null || v === undefined || v === '') { nulls[k] = (nulls[k] || 0) + 1; return; }
        if (typeof v !== FIELD_TYPES[k]) warn.push('자료형: id ' + p.id + ' ' + k + ' = ' + JSON.stringify(v));
      });
      if (p.typeId && allowedTypes.indexOf(p.typeId) === -1) { warn.push('허용값 밖: id ' + p.id + ' typeId = "' + p.typeId + '" → 화면에서 제외'); ok = false; }
      if (!p.sourceBasisDate) nulls.sourceBasisDate = (nulls.sourceBasisDate || 0) + 1;
      if (!p.sourceUrl) nulls.sourceUrl = (nulls.sourceUrl || 0) + 1;
      return ok;
    });
    console.log('빈 값(null) 수:', nulls);
    if (warn.length) warn.forEach(function (w) { console.warn(w); }); else console.log('경고: 없음');
    console.log('화면에 표시할 건수:', valid.length);
    console.groupEnd();
    return valid;
  }

  // ----- 불러오기 (fetch) -----
  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function loadData() {
    setLoading(true);
    return Promise.all([fetchJson(TYPES_URL), fetchJson(DATA_URL)]).then(function (res) {
      types = res[0];
      types.forEach(function (t) { typeName[t.typeId] = t.typeName; });
      var ids = types.map(function (t) { return t.typeId; });
      var valid = checkData(res[1], DATA_URL, ids);
      if (!valid) throw new Error('JSON 최상위가 배열이 아닙니다');
      cases = valid;
      buildTypeChips();
      setLoading(false);
      dataReady = true;
      renderHome();
      renderList(true);
      show(currentName());                               // 상세 주소로 바로 들어온 경우 이제 사례를 찾을 수 있음
    }).catch(function (err) {
      console.error('[불러오기 실패]', err);
      setLoading(false);
      showLoadError(true);
    });
  }
  function setLoading(on) {
    $('state-loading').hidden = !on;
    if (on) { showLoadError(false); $('case-list').hidden = true; $('state-empty').hidden = true; }
  }
  function showLoadError(on) {
    $('state-cases-error').hidden = !on;
    $('state-home-error').hidden = !on;
    $('home-case-list').hidden = on;
    $('home-cases').hidden = on;
    if (on) { $('case-list').hidden = true; $('btn-load-more').hidden = true; $('state-empty').hidden = true; $('result-count').textContent = '0'; }
  }
  $('btn-retry').addEventListener('click', loadData);
  $('btn-home-retry').addEventListener('click', loadData);

  // ----- 조건 → 결과 배열 -----
  var SORTERS = {
    latest: function (a, b) {                              // 기준일 최신 먼저, 기준일 없는 사례는 맨 뒤
      var x = a.sourceBasisDate || '', y = b.sourceBasisDate || '';
      return y.localeCompare(x) || a.title.localeCompare(b.title, 'ko');
    },
    type: function (a, b) {                                // types.json 순서대로 유형을 묶고, 같은 유형은 최신순
      return typeIndex(a.typeId) - typeIndex(b.typeId) || SORTERS.latest(a, b);
    },
    title: function (a, b) { return a.title.localeCompare(b.title, 'ko'); }
  };
  function typeIndex(id) { for (var i = 0; i < types.length; i++) if (types[i].typeId === id) return i; return 99; }

  // 필터 규칙표: 조건 버튼 ↔ 사용하는 필드 ↔ 통과 조건 (여러 개를 고르면 모두 만족해야 함 = AND)
  var FILTER_RULES = {
    money: function (p) { return (p.demandTags || []).indexOf('money') !== -1; },   // 돈·송금 요구 (demandTags, 가공)
    app:   function (p) { return (p.demandTags || []).indexOf('app') !== -1; },     // 앱·원격 설치 요구 (demandTags, 가공)
    info:  function (p) { return (p.demandTags || []).indexOf('info') !== -1; },    // 신분증·카드·인증 정보 요구 (demandTags, 가공)
    link:  function (p) { return /^https:\/\//.test(p.sourceUrl || ''); }            // 출처 링크 있음 (sourceUrl, 조사)
  };
  var FILTER_LABELS = { money: '돈·송금 요구', app: '앱·원격 설치 요구', info: '신분증·카드·인증 정보 요구', link: '출처 링크 있음' };
  var KEYWORD_FILTERS = ['money', 'app', 'info'];        // 문장 속 단어로 분류한 조건(정확하지 않을 수 있음)

  // s 에 조건 상태를 넘기면 그 조건으로 계산 (기본은 현재 state) — '해제하면 몇 건' 계산에도 같은 함수를 씀
  function results(s) {
    s = s || state;
    var q = norm(s.search);
    return cases.filter(function (p) {
      return (!s.realOnly || p.isReal === true) &&
             (!s.type || p.typeId === s.type) &&
             (!q || norm(p.title + p.summary).indexOf(q) !== -1) &&
             s.filters.every(function (f) { return (FILTER_RULES[f] || function () { return true; })(p); });
    }).sort(SORTERS[s.sort] || SORTERS.latest);          // filter가 만든 새 배열을 정렬하므로 원본 cases는 그대로
  }
  function activeCount() {
    return (state.search ? 1 : 0) + (state.type ? 1 : 0) + state.filters.length;     // 기본값(실제 사례만 보기)은 조건 수에 세지 않음
  }

  // 0건일 때: 조건을 하나씩 빼 보고, 가장 많은 사례가 나오는 해제 후보를 찾음
  function relaxOption() {
    var tries = [];
    state.filters.forEach(function (f) {
      tries.push({ label: FILTER_LABELS[f], next: Object.assign({}, state, { filters: state.filters.filter(function (x) { return x !== f; }) }) });
    });
    if (state.type) tries.push({ label: typeName[state.type], next: Object.assign({}, state, { type: '' }) });
    if (state.search) tries.push({ label: "검색어 '" + state.search + "'", next: Object.assign({}, state, { search: '' }) });
    if (state.realOnly) tries.push({ label: '실제 사례만 보기', next: Object.assign({}, state, { realOnly: false }) });
    var best = null;
    tries.forEach(function (t) { t.count = results(t.next).length; if (t.count && (!best || t.count > best.count)) best = t; });
    return best;
  }

  // ----- 카드 만들기 (목록·홈 공통) -----
  function dateText(p) { return p.sourceBasisDate ? '기준일 ' + p.sourceBasisDate : '기준일 미확인'; }
  function makeCard(p) {
    var li = $('case-card-tpl').content.firstElementChild.cloneNode(true);
    li.dataset.id = p.id; li.dataset.type = p.typeId;
    if (p.sourceUrl && /^https:\/\//.test(p.sourceUrl)) li.dataset.sourceUrl = p.sourceUrl;
    li.querySelector('.case-type-name').textContent = typeName[p.typeId] || p.typeId;
    li.querySelector('.origin-tag').hidden = p.isReal === true;
    li.querySelector('.case-link').textContent = p.title;
    li.querySelector('.case-source').textContent = p.source || (p.isReal ? '출처 확인 중' : 'AI 보완 · 출처 없음');
    var t = li.querySelector('.case-date'); t.textContent = dateText(p);
    if (p.sourceBasisDate) t.setAttribute('datetime', p.sourceBasisDate);
    li.querySelectorAll('.btn-open').forEach(function (b) { b.dataset.id = p.id; });
    return li;
  }

  // ----- 목록 그리기 -----
  function renderList(reset) {
    if (reset) shown = PAGE_SIZE;
    var arr = results();
    var list = $('case-list');
    list.replaceChildren();
    arr.slice(0, shown).forEach(function (p) { list.appendChild(makeCard(p)); });

    var n = activeCount();
    $('result-count').textContent = arr.length;
    $('filter-count').textContent = n ? '· 조건 ' + n + '개 적용' : '';
    var fc = activeCount() - (state.search ? 1 : 0);      // 패널 안 조건 수
    $('filter-badge').textContent = fc; $('filter-badge').hidden = !fc;
    $('btn-reset-all').disabled = !(state.search || state.type || state.filters.length || !state.realOnly || state.sort !== 'latest');
    list.hidden = arr.length === 0;
    $('state-empty').hidden = arr.length !== 0;
    if (arr.length === 0) {                              // 결과 없음: 이유 + 다음 행동(조건 해제 제안·전체 초기화)
      var r = relaxOption(), btn = $('btn-relax');
      $('empty-reason').textContent = n > 1 ? '조건이 많아 맞는 사례가 없습니다' : '이 조건에 맞는 사례가 없습니다';
      btn.hidden = !r;
      if (r) { btn.textContent = r.label + ' 해제하면 ' + r.count + '건 보기'; btn.onclick = function () { state = r.next; $('query').value = state.search; renderList(true); }; }
    }
    var notes = [];                                      // 데이터 구분 안내: 조건을 바꿔도 사라지지 않게 매번 다시 계산
    if (!state.realOnly) notes.push("'AI 보완' 표시가 있는 카드는 실제 사건이 아닌 예시입니다.");
    if (state.filters.some(function (f) { return KEYWORD_FILTERS.indexOf(f) !== -1; })) notes.push("'요구' 조건은 단어 기준 분류라 정확하지 않을 수 있습니다.");
    $('list-notice').textContent = notes.join(' '); $('list-notice').hidden = !notes.length;
    var more = $('btn-load-more');
    more.hidden = arr.length <= shown;
    more.textContent = '＋  ' + Math.min(shown, arr.length) + ' / ' + arr.length;
    syncControls();
  }
  function syncControls() {
    $('real-only').checked = state.realOnly;
    $('sort').value = state.sort;
    document.querySelectorAll('#type-filters .chip').forEach(function (c) {
      c.setAttribute('aria-pressed', c.dataset.type === state.type ? 'true' : 'false');
    });
    document.querySelectorAll('#cond-filters .chip').forEach(function (c) {      // 조건 버튼 표시는 state.filters 를 보고 다시 그림
      c.setAttribute('aria-pressed', state.filters.indexOf(c.dataset.filter) !== -1 ? 'true' : 'false');
    });
  }
  function buildTypeChips() {
    var box = $('type-filters'); box.replaceChildren();
    [{ typeId: '', typeName: '전체' }].concat(types).forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.type = t.typeId; b.textContent = t.typeName;
      box.appendChild(b);
    });
    var cond = $('cond-filters'); cond.replaceChildren();
    Object.keys(FILTER_RULES).forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.filter = f; b.textContent = FILTER_LABELS[f];
      cond.appendChild(b);
    });
  }

  // ----- 홈: 최신 실제 사례 3건 -----
  function renderHome() {
    var list = $('home-case-list'); list.replaceChildren();
    cases.filter(function (p) { return p.isReal; }).sort(SORTERS.latest).slice(0, 3)
      .forEach(function (p) { list.appendChild(makeCard(p)); });
    $('home-cases').hidden = !list.children.length;
  }

  // ----- 상세 -----
  function fillList(ul, arr) {
    ul.replaceChildren();
    (arr || []).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  }
  function setSource(url) {
    var link = $('source-link'), none = $('source-none');
    if (/^https:\/\//.test(url || '')) { link.href = url; link.hidden = false; none.hidden = true; }
    else { link.removeAttribute('href'); link.hidden = true; none.hidden = false; }
  }
  function fillDetail(p) {
    $('case-detail').dataset.id = p.id;
    setSource(p.sourceUrl);
    $('case-type').textContent = (typeName[p.typeId] || p.typeId) + (p.isReal ? '' : ' · AI 보완');
    $('case-title').textContent = p.title;
    $('case-summary').textContent = p.summary || '요약이 없습니다';
    fillList($('case-risks'), p.riskSigns);
    $('case-method').textContent = p.method || '설명이 없습니다';
    fillList($('case-actions'), p.actions);
    $('case-source').textContent = p.source || (p.isReal ? '출처 확인 중' : 'AI 보완 · 출처 없음');
    $('case-date').textContent = dateText(p);
    var note = $('case-note');
    var text = p.isReal ? (p.dateNote && !p.sourceBasisDate ? '기준일: ' + p.dateNote : '') : '실제 사건이 아니라 AI가 보완한 예시 문구입니다';
    note.textContent = text; note.hidden = !text;
  }

  // ----- 조건 바꾸기: state만 바꾸고 renderList 호출 -----
  $('search-form').addEventListener('submit', function (e) { e.preventDefault(); state.search = $('query').value.trim(); renderList(true); });
  $('query').addEventListener('search', function () { state.search = $('query').value.trim(); renderList(true); });   // ✕로 지울 때
  $('type-filters').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    state.type = c.dataset.type; renderList(true);
  });
  $('cond-filters').addEventListener('click', function (e) {     // 토글: 켜져 있으면 빼고, 없으면 추가
    var c = e.target.closest('.chip'); if (!c) return;
    var f = c.dataset.filter;
    state.filters = state.filters.indexOf(f) !== -1 ? state.filters.filter(function (x) { return x !== f; }) : state.filters.concat(f);
    renderList(true);
  });
  $('real-only').addEventListener('change', function (e) { state.realOnly = e.target.checked; renderList(true); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderList(true); });
  function resetAll() { state = defaultState(); $('query').value = ''; renderList(true); }
  $('btn-reset-all').addEventListener('click', resetAll);
  $('btn-reset').addEventListener('click', resetAll);
  $('btn-filter-toggle').addEventListener('click', function () {   // 필터는 기본 닫힘, 눌러서 열고 닫음
    var open = $('filter-panel').hidden;
    $('filter-panel').hidden = !open;
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.querySelector('.chev').textContent = open ? '▴' : '▾';
  });
  $('btn-load-more').addEventListener('click', function () { shown += PAGE_SIZE; renderList(false); });

  loadData();

  show(currentName());
})();
