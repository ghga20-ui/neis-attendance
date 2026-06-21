# 학생 개인정보 Case C 전환 설계 (이름 로컬화 + 고지 문서)

- 작성일: 2026-06-21
- 대상: `subject_teacher/` (데스크톱), `subject_teacher_pwa/` (모바일 PWA)
- 근거 규정 요약: https://dorms.school/notice/edu-software (교육 소프트웨어 도입 기준)

## 1. 배경 / 문제

현재 교과담임 앱은 **학생 실명(`students.json`)·학번·출결**을 Google Drive
`appDataFolder`(해외 SaaS, 미국)로 전송·저장한다. 이는 도입 기준의 **Case D
(식별정보의 클라우드 전송)** 에 해당해 가장 무거운 의무(학운위 심의 + 처리방침 +
위탁 + 국외이전 + CSAP/보안성 검토)를 진다.

근거 코드:
- `subject_teacher/drive/schemas.py` `StudentEntry.name`, `Students`
- `subject_teacher/drive/store.py` `save_students` / `load_students`
- `subject_teacher/gui/api.py` `save_students_tsv` → `store.save_students`
- `subject_teacher_pwa/src/lib/driveData.ts` `loadStudents` (모바일이 클라우드 명부를 읽어 이름 표시)

## 2. 목표 / 비목표

**목표**
- 학생 **직접식별자(이름)** 를 클라우드에서 제거하여 **Case D → Case C(가명정보 전송)** 로 내린다.
- 현행 워크플로(모바일=수업 중 출결 등록, 데스크톱=검토·NEIS 연동) 유지.
- Case C에 필요한 **고지/동의 문서·화면** 제공.

**비목표 (의도적으로 안 함)**
- Case B(외부전송 0) 달성 — 클라우드 동기화를 쓰는 한 학번(간접식별자=가명정보)은
  외부로 나가므로 구조적으로 불가. C가 바닥임을 수용한다.
- 학번 토큰화/암호화 — 통제자 입장에선 재식별 가능해 등급(C)이 안 바뀌고 복잡도만 늘어 **하지 않는다**.
- 이름의 클라우드 암호화 동기화 — "간편·확실" 기준에서 오버. 이름은 **로컬 전용**으로 간다.

## 3. 핵심 결정 (확정됨)

| 항목 | 결정 |
|---|---|
| 모바일 이름 표시 | **번호만** ("5번"). 명부를 모바일에 넣지 않음 |
| 데스크톱 이름 | **로컬 보관** (검토 화면에서 이름 표시) — 옵션 X |
| 클라우드 동기화 대상 | `settings.json`, `timetable.json`, `attendance-*.json` (전부 학번 기반=가명) |
| 로컬 명부 저장 | `%LOCALAPPDATA%\NeisSubject\students.local.json`, **DPAPI 암호화**(`password.bin` 패턴 재사용) |
| 기존 클라우드 평문 명부 | 데스크톱 시작 시 **자동 마이그레이션**: 다운로드→로컬 저장→클라우드 삭제(1회 로그) |

## 4. 데이터 흐름 (변경 후)

```
[데스크톱]                          [Google Drive]              [모바일 PWA]
 명부(이름+번호)                     settings.json   ──────►     번호만 표시
  └ students.local.json             timetable.json              "5번 [결석]"
     (DPAPI, 로컬 전용)             attendance-*.json ◄────►   수업중 번호로 등록
 검토화면: 이름 표시 ◄─로컬          (전부 학번 기반 = 가명정보)
 NEIS 입력: 학번 사용
```

이름은 어떤 경로로도 클라우드/모바일로 가지 않는다.

## 5. 코드 변경

### 5.1 로컬 명부 저장소 (데스크톱, 신규)
- `paths.py`: `get_students_path()` → `get_app_data_dir() / "students.local.json"`
- 신규 모듈 `subject_teacher/local_store.py`:
  - `load_local_students() -> Students | None`
  - `save_local_students(students: Students) -> None`
  - 직렬화: 기존 `Students` 스키마(JSON) 재사용. 저장 시 DPAPI 암호화, 로드 시 복호화
    (`auth/token_store.py` 또는 기존 password 암호화 헬퍼 재사용).

### 5.2 데스크톱 API 경로 전환 (`gui/api.py`)
- `save_students_tsv`: `store.save_students(...)` → `save_local_students(...)`
- `get_students_tsv`: `store.load_students()` → `load_local_students()`
- `get_mobile_snapshot`: 반환에서 `students` 필드 **제거** (모바일은 이름 미수신)
- 이름이 필요한 기존 경로(`summarize_day` 등 데스크톱 표시)는 로컬 명부 사용

### 5.3 Drive 계층에서 이름 제거 (`drive/store.py`, `drive/schemas.py`)
- `DriveStore.save_students` / `load_students` / `STUDENTS` 상수 **제거**
- `Students` / `StudentEntry` 스키마는 **유지하되 로컬 저장 용도**로 남김
  (`schemas.py`에 두되 Drive 미사용, 또는 `local_store.py`로 이동 — 구현 시 결정)

### 5.4 마이그레이션 (`gui/api.py` 또는 app_service 시작 경로, 일회성)
- 데스크톱 부팅/스토어 빌드 시:
  1. `client.find_file_id("students.json")` 존재 확인
  2. 있으면 다운로드 → `save_local_students()` (로컬에 없을 때만 보존)
  3. `client.delete("students.json")` 로 클라우드 영구 삭제
  4. INFO 로그 1줄 남김 (`migrated students.json to local, deleted from Drive`)
- 멱등: 클라우드에 없으면 no-op.

### 5.5 PWA 번호만 (`subject_teacher_pwa`)
- `lib/driveData.ts`: `loadStudents` 제거, `loadAll`에서 students 제외
- UI(`App.tsx` 등): 학생 이름 표시 → **"{number}번"** 표시로 변경
- `lib/schemas.ts`: `Students`/`StudentEntry` 미사용 처리(제거 또는 보존만)

### 5.6 출결 note 가드
- `Absence.note` 입력 UI에 "이름 입력 금지(학번만 사용)" 안내. (검증은 best-effort)

## 6. 문서 / 고지 산출물

고지는 두 층위다. **앱은 양식·화면을 제공**, **실제 동의 수령은 학교 채널**(가정통신문/학운위).

### 6.1 개인정보 처리방침 (인앱)
- 위치: 데스크톱 설정/about 화면, PWA 하단 링크
- 내용: 수집항목(학번·출결·교사명·학교명·시간표), 목적, 보유기간, 위탁(Google LLC),
  국외이전(미국 — §28-8 7항목: 이전받는 자/국가/항목/시점·방법/목적/보유기간/거부권),
  파기, 정정·삭제 요청 경로
- **명시**: "학생 이름은 데스크톱 기기 로컬에만 저장되며 외부로 전송되지 않습니다."
- 파일: `docs/legal/privacy-policy.md` (앱이 렌더링)

### 6.2 교사용 최초 1회 안내 모달
- 첫 실행 시 1회: "학생 개인정보(학번·출결)를 처리합니다. 학교 동의 절차 완료를 확인하세요"
  + 처리방침 링크 + 확인 체크박스 (동의가 아닌 acknowledgment)

### 6.3 보호자 고지·동의서 양식 (학교 배포용)
- 가정통신문 템플릿(14세 미만 법정대리인 동의 포함)
- 클라우드엔 가명 출결만 가므로 문구 경량
- 파일: `docs/legal/guardian-consent-template.md`

### 6.4 (선택) 학운위 심의 요약 1장
- 도입 SW 개요·수집항목·전송 범위(이름 미전송)·근거 1페이지 요약
- 파일: `docs/legal/school-board-summary.md`

## 7. 테스트

- `local_store`: 저장→로드 라운드트립, DPAPI 암복호화, 빈 상태
- 마이그레이션: 클라우드 students.json 있음→다운로드+로컬저장+삭제 호출 검증, 없음→no-op (mock client)
- `get_mobile_snapshot`: 반환에 `students`(이름) 없음 단언
- `gui/api.py`: `save/get_students_tsv`가 Drive 아닌 로컬 경로 사용 단언
- PWA: 슬롯/출결 렌더가 number로 표시 (스냅샷 테스트 또는 단위)

## 8. 위험 / 캐비엇

- DPAPI는 Windows 계정 종속 — 프로필 손실 시 로컬 명부 복호화 불가(명부 재입력으로 복구).
- 본 설계는 엔지니어링 관점이며 최종 등급/의무는 학교·교육청 기준으로 확인 필요(가목/나목/다목
  프레임은 표준).
- 마이그레이션은 다계정(교사별 Drive)에서 각자 1회 수행됨.

## 9. 구현 순서 (병렬 2트랙)

- **트랙 A (코드)**: 5.1 로컬 저장소 → 5.4 마이그레이션 → 5.2/5.3 경로 전환 → 5.5 PWA → 5.6 가드 → 7 테스트
- **트랙 B (문서)**: 6.1 처리방침 → 6.3 보호자 양식 → 6.2 안내 모달 → 6.4 요약
