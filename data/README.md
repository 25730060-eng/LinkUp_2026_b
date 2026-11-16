# data/ 설명 (갱신: 2026-11-16)

화면은 `cases_all.json`(사례)과 `types.json`(유형)을 `fetch`로 읽어 사용합니다. 나머지 파일은 조사 자료이며 아직 화면에 연결하지 않았습니다.

## 1. 데이터 출처·구분표

| 파일 | 건수 | 내용 | 연결 방식 | 값의 성격 |
|---|---|---|---|---|
| cases_all.json | 191 | 사례 목록·상세 (실제 사례 21 + AI 보완 170) | 저장 JSON, 화면 연결(fetch) | 실제 21(직접조사) / AI 보완 170(isReal false, 출처 없음) |
| types.json | 7 | 유형 id·이름 | 저장 JSON, 화면 연결(fetch) | 직접 정의 |
| cases.json 외 cases_*.json | 21 | cases_all.json의 실제 사례 원본(합치기 전) | 저장 JSON, 미연결 | 직접조사 |
| samples.json | 170 | AI 생성 변형 문구 원본 | 저장 JSON, 미연결 | AI 보완 |
| contacts / guides / news / stats* / rules | 12 / 54 / 19 / 18 / 6 | 연락처·행동요령·기사·통계·유형 판별 규칙 | 저장 JSON, 미연결 | 직접조사 |

외부 API는 사용하지 않습니다(API 미연동).

## 2. cases_all.json 필드

| 필드 | 자료형 | 설명 | 분류 |
|---|---|---|---|
| id | string | `c-001`(실제), `s-001`(AI 보완). 중복 없음 | 부여 |
| typeId | string | types.json의 typeId 중 하나(허용값 7종) | 조사/분류 |
| title, summary, method | string | 새 문장으로 요약(원문 복사 안 함) | 조사 |
| riskSigns, actions | string[] | 위험 신호, 대응 행동 | 조사 |
| source, sourceUrl | string/null | 출처명, 개별 페이지 주소. 없으면 null | 조사 |
| sourceBasisDate | string/null | 출처 페이지 기준일(YYYY-MM-DD). 모르면 null | 조사 |
| dateNote | string | 기준일이 null인 실제 사례의 사유 | 조사 |
| collectedAt | string | 확인일 | 조사 |
| origin, isReal | string, boolean | 직접조사/AI보완, 실제 여부 | 구분 |
| demandTags | string[] | 요구 내용 분류: money(돈·송금), app(앱·원격 설치), info(신분증·카드·인증 정보) | **가공**(제목·요약·수법·위험신호 속 단어로 자동 분류, 정확하지 않을 수 있음) |

## 3. 필터 규칙표 (사례 화면)

| 조건 버튼 / 입력 | 사용 필드 | 통과 조건 | 필드 분류 | 연결 방식 |
|---|---|---|---|---|
| 검색 | title, summary | 공백·대소문자 무시하고 검색어 포함 | 조사 | 저장 JSON |
| 유형 칩(1개 선택) | typeId | typeId가 같음 | 조사/분류 | 저장 JSON |
| 실제 사례만 보기 | isReal | isReal === true | 구분 | 저장 JSON |
| 돈·송금 요구 | demandTags | money 포함 | 가공 | 저장 JSON |
| 앱·원격 설치 요구 | demandTags | app 포함 | 가공 | 저장 JSON |
| 신분증·카드·인증 정보 요구 | demandTags | info 포함 | 가공 | 저장 JSON |
| 출처 링크 있음 | sourceUrl | https 주소가 있음 | 조사 | 저장 JSON |

- 조건 버튼은 여러 개를 함께 선택할 수 있고, 모두 만족하는 사례만 나옵니다(AND).
- 정렬: 최신순(sourceBasisDate, 없으면 맨 뒤) / 유형순(types.json 순서) / 가나다순(title). 정렬은 결과 배열에만 적용하고 원본은 바꾸지 않습니다.
- 도메인 특화 탐색: 결과가 0건이면 조건을 하나씩 해제해 보고, 가장 많은 사례가 나오는 해제 후보를 버튼으로 제안합니다.

## 4. 규칙

- 출처 필드: source, sourceUrl, sourceBasisDate(페이지 기준일), collectedAt(확인일)
- AI 보완 데이터는 origin "AI보완", isReal false로 표시하고 화면에도 "AI 보완"을 표시합니다.
- 출처 주소를 확인하지 못한 항목은 sourceUrl을 null로 두고 화면에 "준비 중"으로 표시합니다.
- 기사·보도자료 원문은 복사하지 않고 새 문장으로 요약합니다.
- 통계는 기관·기간 기준이 달라 합산하지 않습니다.
