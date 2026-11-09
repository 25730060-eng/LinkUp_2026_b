# data/ 변경 내용 (2026-11-09)

화면 연결(fetch·렌더링)은 다음 주차 작업입니다. 이번에는 data/ 폴더의 JSON 파일만 추가·수정했습니다.

## 파일
| 파일 | 건수 | 내용 | origin |
|---|---|---|---|
| contacts.json | 12 | 연락처·기관 (112, 1332, 118, 1394, 182, 114, 132 등) | 직접조사 |
| guides.json | 54 | 행동요령 | 직접조사 |
| news.json | 19 | 예시 기사·보도자료 | 직접조사 |
| stats_news.json | 18 | 통계 (기관·기간 기준이 달라 합산 금지) | 직접조사 |
| rules.json | 6 유형 | 유형 판별 키워드 | 직접조사 |
| cases_draft_*.json | 4 | 실제 사례 후보(출처 확인 필요 표시 있음) | 직접조사 |
| samples.json | 170 | AI 생성 변형 문구. 실제 사건 아님 | AI보완 (isReal: false) |

## 규칙
- 출처 필드: source, publisher, sourceUrl, sourceBasisDate(페이지 기준일), collectedAt(확인일)
- AI 생성 데이터는 origin "AI보완", isReal false로 표시. 출처 없음.
- 출처 주소 미확인 항목은 sourceUrl을 비우고 note에 사유 기재.
- 기사·보도자료 원문은 복사하지 않고 새 문장으로 요약.
