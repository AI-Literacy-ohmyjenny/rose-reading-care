# 로즈 독서상담 (Rose Reading Care)

초등 독서상담 웹앱 - 젊은 여성 선생님의 따뜻한 퍼스널 브랜드 컨셉

## 프로젝트 구조

```
Rose-Reading-Care-v2/
├── Code.gs          # Google Apps Script - CSV → JSON API
├── Index.html       # 메인 HTML (좌우 분할 레이아웃)
├── Script.js        # 시나리오 순서 기반 대화 진행 로직
├── Style.css        # 파스텔톤 UI 스타일
├── appsscript.json  # Apps Script 매니페스트
└── README.md
```

## 레이아웃

- **왼쪽**: 이미지 영역(위) + 지문(아래)
- **오른쪽**: AI 선생님 2D 얼굴(위) + 학생 대화창(아래)

## 설정 방법

### 1. Google Apps Script 배포

1. [Google Apps Script](https://script.google.com/)에서 새 프로젝트 생성
2. `Code.gs` 내용을 붙여넣기
3. **중요**: Google Drive에 CSV 파일 업로드 후, `Code.gs`의 `FILE_IDS`와 일치하는지 확인
   - Google **시트**인 경우: `Code.gs`의 `getCSVFromDrive` 대신 `SpreadsheetApp` 사용 필요 (시트 구조에 맞게 수정)
   - 실제 **CSV 파일**인 경우: Drive에 업로드 후 파일 ID 확인, 스크립트 실행 계정이 해당 파일에 접근 가능해야 함
4. **배포** → **새 배포** → **웹 앱**
   - 실행 계정: 본인
   - 액세스: 모든 사용자
5. 배포된 **웹 앱 URL** 복사

### 2. Index.html을 GAS 프로젝트에 추가

1. GAS 편집기에서 **파일** → **새로 만들기** → **HTML**
2. 파일 이름을 `Index`로 지정
3. 이 프로젝트의 `Index.html` 내용을 전체 복사해 붙여넣기

### 3. 실행 (CORS 회피)

**웹앱 배포 URL을 브라우저 주소창에 직접 입력해 실행하세요.**

- `http://localhost`나 `file://`에서 열면 CORS 오류가 발생합니다.
- 반드시 `https://script.google.com/macros/s/.../exec` 형태의 GAS 배포 URL로 접속해야 합니다.

## CSV 데이터 구조 (시나리오)

시나리오 CSV 예시 컬럼:

| 순서 | 발화자 | 내용  | 지문 | 이미지 |
| ---- | ------ | ----- | ---- | ------ |
| 1    | 선생님 | 안녕! | ...  | (URL)  |

- `순서`: 정렬 및 진행 순서
- `내용`에 `<br>` 사용 시 화면에서 줄바꿈으로 표시됨

## CSV 파일 ID (Google Drive)

- 시나리오: `1B28svEHfEFzbEYHVFBlRbfFNG5cPJsA94Tu2pSJaq2M`
- data: `1vagmmcfsRYrAzYEwhCzOa2K983l96tGU73ylYSnsVzQ`
- 도서정보: `1Wonsarr1K-yZ8qDrN2ftUN5saOhMiu1AkOuGTchPAvw`
- 목차\_배우는내용: `1cxZjQTnqvEafS5KHTqfgmz9DbA0HlLNceF9UNHAO9kc`
