'use strict';

// 화면 전환만 담당합니다. 유형 판별·JSON·저장은 이후 단계에서 추가합니다.
// 방식: 단일 HTML, 해시(#home 등)로 화면 하나만 hidden 해제 → 브라우저 뒤로가기도 동작
(function () {
  var SCREENS = ['home', 'result', 'cases', 'detail', 'saved'];
  var TAB_SCREENS = ['home', 'cases', 'saved'];       // 1단계: 탭바 표시
  var PARENT = { result: 'home', detail: 'cases' };     // 2단계: 뒤로가기 대상

  var tabs = document.querySelectorAll('#tabbar .tab');
  var input = document.getElementById('input-text');
  var btnCheck = document.getElementById('btn-check');
  var inputError = document.getElementById('input-error');
  var resultText = document.getElementById('result-text');
  var btnPaste = document.getElementById('btn-paste');
  var pasteFail = document.getElementById('paste-fail');
  var detailOrigin = 'cases';                           // 상세로 들어온 화면 (cases 또는 saved)

  function currentName() {
    var name = location.hash.replace('#', '');
    return SCREENS.indexOf(name) === -1 ? 'home' : name;
  }

  function show(name) {
    // 입력 없이 확인 결과로 직접 들어오면 홈으로 되돌림 (원문은 저장하지 않으므로 새로고침 시 사라짐)
    if (name === 'result' && !input.value.trim()) name = 'home';

    SCREENS.forEach(function (s) {
      document.getElementById('screen-' + s).hidden = (s !== name);
    });

    // 탭 강조는 1단계 화면에서만, 2단계는 부모 탭 기준
    var tabName = TAB_SCREENS.indexOf(name) !== -1 ? name : (name === 'detail' ? detailOrigin : PARENT[name]);
    tabs.forEach(function (a) {
      if (a.dataset.tab === tabName) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    window.scrollTo(0, 0);
  }

  function go(name) {
    if (location.hash === '#' + name) show(name);
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
  document.getElementById('btn-detail-back').addEventListener('click', function () { goBack('detail'); });

  // 사례 카드의 '자세히 보기'·'열기' → 사례 상세 (이벤트 위임: 카드가 나중에 생성돼도 동작)
  document.addEventListener('click', function (e) {
    var open = e.target.closest('.btn-open');
    if (!open) return;
    detailOrigin = currentName() === 'saved' ? 'saved' : 'cases';   // 뒤로가기 때 돌아갈 화면
    document.getElementById('case-detail').dataset.id = open.dataset.id;
    go('detail');
  });


  // ----- 유형 필터 (사례 목록·저장함 공통) -----
  // 칩(data-type)을 누르면 카드(data-type)를 거르고, 건수와 '결과 없음' 영역을 갱신
  function setupTypeFilter(cfg) {
    var screen = document.getElementById(cfg.screenId);
    var chips = screen.querySelectorAll('.chip[data-type]');
    var cards = document.getElementById(cfg.listId).querySelectorAll('.case-card');
    var countEl = document.getElementById(cfg.countId);
    var emptyEl = document.getElementById(cfg.emptyId);
    var listEl = document.getElementById(cfg.listId);

    function apply(type) {
      var visible = 0;
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c.dataset.type === type ? 'true' : 'false');
      });
      cards.forEach(function (card) {
        var show = !type || card.dataset.type === type;
        card.hidden = !show;
        if (show) visible++;
      });
      countEl.textContent = visible;
      emptyEl.hidden = visible !== 0;
      listEl.hidden = visible === 0;
    }

    chips.forEach(function (c) {
      c.addEventListener('click', function () { apply(c.dataset.type); });
    });
    (cfg.resetIds || []).forEach(function (id) {
      document.getElementById(id).addEventListener('click', function () { apply(''); });
    });

    var pressed = screen.querySelector('.chip[data-type][aria-pressed="true"]');
    apply(pressed ? pressed.dataset.type : '');       // 처음 표시: HTML에서 선택된 칩 기준
  }

  setupTypeFilter({ screenId: 'screen-cases', listId: 'case-list', countId: 'result-count',
                    emptyId: 'state-empty', resetIds: ['btn-reset', 'btn-all'] });
  setupTypeFilter({ screenId: 'screen-saved', listId: 'saved-case-list', countId: 'saved-count-num',
                    emptyId: 'state-saved-filter-empty', resetIds: ['btn-saved-all'] });

  // 조건 더보기 펼치기·접기
  var btnMore = document.getElementById('btn-more');
  var morePanel = document.getElementById('more-filters');
  btnMore.addEventListener('click', function () {
    var open = morePanel.hidden;
    morePanel.hidden = !open;
    btnMore.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  show(currentName());
})();
