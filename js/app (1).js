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

    go('detail/' + encodeURIComponent(open.dataset.id));   // 주소에 사례 id가 들어가므로 새로고침·뒤로가기가 동작
  });

  // ----- 저장(즐겨찾기): localStorage에는 사례 id 목록만 저장 -----
  //   형태: [{"id":"c-001","savedAt":"2026-11-23"}, …]  (새로 저장한 것이 앞)
  //   제목·요약 등은 JSON에서 id로 찾아 그림 → 데이터가 바뀌어도 반영됨. 입력한 메시지는 저장하지 않음.
  var SAVED_KEY = 'ttokttok.saved.v1';
  var savedList = readSaved();                           // 메모리 복사본(저장소가 막혀도 이번 방문 동안은 동작)
  var savedType = '';                                    // 마이 화면의 유형 필터
  function readSaved() {
    try {
      var a = JSON.parse(localStorage.getItem(SAVED_KEY));
      if (!Array.isArray(a)) return [];
      var seen = {};
      return a.filter(function (x) {
        if (!x || typeof x.id !== 'string' || seen[x.id]) return false;
        seen[x.id] = true; return true;
      }).map(function (x) { return { id: x.id, savedAt: typeof x.savedAt === 'string' ? x.savedAt : '' }; });
    } catch (e) { return []; }
  }
  function writeSaved() { try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedList)); } catch (e) { /* 저장 차단: 메모리에서만 유지 */ } }
  function isSaved(id) { return savedList.some(function (x) { return x.id === id; }); }
  function today() { var d = new Date(); function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function toggleSaved(id) {
    var now;
    if (isSaved(id)) { savedList = savedList.filter(function (x) { return x.id !== id; }); now = false; }
    else { savedList.unshift({ id: id, savedAt: today() }); now = true; }
    writeSaved(); refreshSaveUI(); return now;
  }
  function paintBookmark(b, id) {
    var on = isSaved(id);
    b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? '저장 취소' : '저장');
  }
  function refreshSaveUI() {                             // 화면에 있는 모든 저장 표시를 현재 상태에 맞춤
    Array.prototype.forEach.call(document.querySelectorAll('.btn-bookmark'), function (b) {
      var li = b.closest('.case-card'); if (li) paintBookmark(b, li.dataset.id);
    });
    syncSaveBtn(); renderSaved();
  }
  function syncSaveBtn() {
    var id = document.getElementById('case-detail').dataset.id, b = document.getElementById('btn-save-case'), on = !!id && isSaved(id);
    b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ 저장됨' : '저장';
  }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  document.addEventListener('click', function (e) {
    var bm = e.target.closest('.btn-bookmark');
    if (bm) { var li = bm.closest('.case-card'); if (li) toggleSaved(li.dataset.id); return; }
    var del = e.target.closest('.btn-delete');           // 마이: 휴지통 = 저장 해제
    if (del) { var c = del.closest('.case-card'); if (c) toggleSaved(c.dataset.id); }
  });
  document.getElementById('btn-save-case').addEventListener('click', function () {
    var id = document.getElementById('case-detail').dataset.id; if (!id) return;
    var on = toggleSaved(id);
    toast(on ? '저장했습니다. 마이에서 볼 수 있어요' : '저장을 취소했습니다');
  });

  // 마이 화면: 저장한 id → 사례 → 카드
  function renderSaved() {
    if (!dataReady) return;
    var items = savedList.map(function (x) { return findCase(x.id); }).filter(Boolean);
    var list = $('saved-case-list'), none = $('state-saved-empty'), fEmpty = $('state-saved-filter-empty');
    var present = {}; items.forEach(function (p) { present[p.typeId] = true; });
    if (savedType && !present[savedType]) savedType = '';
    var box = $('saved-type-filters'); box.replaceChildren();
    [{ typeId: '', typeName: '전체' }].concat(types.filter(function (t) { return present[t.typeId]; })).forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.type = t.typeId; b.textContent = t.typeName;
      b.setAttribute('aria-pressed', String(t.typeId === savedType)); box.appendChild(b);
    });
    $('saved-type-filter-label').parentNode.hidden = items.length === 0;
    var shown = items.filter(function (p) { return !savedType || p.typeId === savedType; });
    list.replaceChildren();
    shown.forEach(function (p) {
      var li = makeCard(p), b = li.querySelector('.btn-bookmark');
      b.classList.remove('btn-bookmark'); b.classList.add('btn-delete'); b.removeAttribute('aria-pressed'); b.setAttribute('aria-label', '저장 삭제');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
      list.appendChild(li);
    });
    list.hidden = shown.length === 0;
    none.hidden = items.length !== 0;
    fEmpty.hidden = items.length === 0 || shown.length !== 0;
  }
  $('saved-type-filters').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return; savedType = c.dataset.type; renderSaved();
  });
  $('btn-saved-all').addEventListener('click', function () { savedType = ''; renderSaved(); });


  // =====================================================================
  // 9주차: 데이터 연결 → 점검 → 상태(state) → 결과 배열(results) → 화면(renderList)
  //   cases   : JSON에서 읽은 원본 배열 (화면에서 절대 바꾸지 않음)
  //   state   : 검색어·유형·실제 사례만·정렬 — 화면 조건은 전부 여기 하나에 모음
  //   results(): 원본에서 조건에 맞는 새 배열을 만들어 돌려줌
  // =====================================================================
  var DATA_URL = 'data/cases_all.json';
  var TYPES_URL = 'data/types.json';
  var NEWS_URL = 'data/news.json';
  var PAGE_SIZE = 20;

  var cases = [];                                        // 원본 배열
  var types = [];                                        // [{typeId, typeName}]
  var typeName = {};                                     // typeId → 표시 이름
  var state = defaultState();
  var page = 1;                                          // 현재 페이지

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
    var newsReq = fetchJson(NEWS_URL).catch(function (err) { console.warn('[기사 불러오기 실패]', err); return []; });   // 기사는 없어도 앱은 동작
    return Promise.all([fetchJson(TYPES_URL), fetchJson(DATA_URL), newsReq]).then(function (res) {
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
      renderNews(res[2]);
      renderList(true);
      renderSaved();
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
    if (on) { $('case-list').hidden = true; $('pager').hidden = true; $('state-empty').hidden = true; $('result-count').textContent = '0'; }
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
    var bm = li.querySelector('.btn-bookmark'); if (bm) paintBookmark(bm, p.id);
    return li;
  }

  // ----- 목록 그리기 -----
  function renderList(reset) {
    if (reset) page = 1;
    var arr = results();
    var pages = Math.max(1, Math.ceil(arr.length / PAGE_SIZE));
    if (page > pages) page = pages;
    var list = $('case-list');
    list.replaceChildren();
    arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach(function (p) { list.appendChild(makeCard(p)); });

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
    renderPager(pages);
    syncControls();
  }
  function renderPager(pages) {
    var nav = $('pager'); nav.replaceChildren(); nav.hidden = pages <= 1; if (pages <= 1) return;
    function add(label, p, cls, aria) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pg ' + (cls || ''); b.textContent = label;
      if (aria) b.setAttribute('aria-label', aria);
      if (p === page && !cls) b.setAttribute('aria-current', 'page');
      if (cls && (p < 1 || p > pages)) b.disabled = true;
      b.addEventListener('click', function () { page = p; renderList(false); window.scrollTo(0, 0); });
      nav.appendChild(b);
    }
    add('‹ 이전', page - 1, 'pg-nav', '이전 페이지');
    var a = Math.max(1, Math.min(page - 1, pages - 2)), z = Math.min(pages, a + 2);
    for (var i = a; i <= z; i++) add(String(i), i, '', i + '페이지');
    add('다음 ›', page + 1, 'pg-nav', '다음 페이지');
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

  // 홈 '최신 사례': 정부·금융당국 기관 원문 링크가 있는 기사 중 기준일 최신순 3건 (data/news.json)
  var OFFICIAL_HOSTS = ['korea.kr', 'fsc.go.kr', 'fss.or.kr'];
  function officialUrl(u) {
    if (typeof u !== 'string' || u.indexOf('https://') !== 0) return false;
    var host = u.split('/')[2] || '';
    return OFFICIAL_HOSTS.some(function (h) { return host === h || host.slice(-(h.length + 1)) === '.' + h; });
  }
  function renderNews(list) {
    var ul = $('news-list'); ul.replaceChildren();
    var items = (Array.isArray(list) ? list : []).filter(function (n) {
      return n && typeof n.title === 'string' && officialUrl(n.sourceUrl) && /^\d{4}-\d{2}-\d{2}$/.test(n.sourceBasisDate || '');
    }).sort(function (a, b) { return a.sourceBasisDate < b.sourceBasisDate ? 1 : a.sourceBasisDate > b.sourceBasisDate ? -1 : 0; }).slice(0, 3);
    items.forEach(function (n) {
      var li = document.createElement('li'); li.className = 'news-card';
      var row = document.createElement('div'); row.className = 'case-row';
      var h = document.createElement('h3'); h.className = 'news-headline'; h.textContent = n.title;
      var a = document.createElement('a'); a.className = 'icon-open news-open'; a.href = n.sourceUrl;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', '기사 원문 보기: ' + n.title + ' (새 탭)');
      a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';
      row.appendChild(h); row.appendChild(a);
      var sum = document.createElement('p'); sum.className = 'news-summary'; sum.textContent = n.summary || '';
      var meta = document.createElement('p'); meta.className = 'case-meta';
      var src = document.createElement('span'); src.className = 'news-source'; src.textContent = n.publisher || '';
      var t = document.createElement('time'); t.className = 'news-date'; t.setAttribute('datetime', n.sourceBasisDate); t.textContent = n.sourceBasisDate;
      meta.appendChild(src); meta.appendChild(document.createTextNode(' · ')); meta.appendChild(t);
      li.appendChild(row); li.appendChild(sum); li.appendChild(meta); ul.appendChild(li);
    });
    $('news').hidden = !items.length;
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
    $('case-detail').dataset.id = p.id; syncSaveBtn();
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
  // 글자 설정 (기본 / 조금 크게 / 크게)
  function applyFs(n) {
    document.body.setAttribute('data-fs', n);
    Array.prototype.forEach.call(document.querySelectorAll('#font-menu button'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-fs') === String(n))); });
    try { localStorage.setItem('ttokttok.fs', n); } catch (e) {}
  }
  var fsInit = '0'; try { fsInit = localStorage.getItem('ttokttok.fs') || localStorage.getItem('fs') || '0'; } catch (e) {}
  applyFs(fsInit);
  $('btn-font').addEventListener('click', function (e) {
    e.stopPropagation(); var m = $('font-menu'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden));
  });
  $('font-menu').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-fs]'); if (!b) return;
    applyFs(b.getAttribute('data-fs')); this.hidden = true; $('btn-font').setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', function () { $('font-menu').hidden = true; $('btn-font').setAttribute('aria-expanded', 'false'); });

  loadData();

  show(currentName());
})();
