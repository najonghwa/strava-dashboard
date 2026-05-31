# Strava Dashboard 처음부터 다시 만들기

이 문서는 Gemini Canvas에서 받은 `strava.tsx` 파일 하나를 출발점으로 해서, GitHub와 Vercel을 이용해 어디서나 접속 가능한 Strava 대시보드 웹사이트를 만드는 방법을 정리한 가이드다.

최대한 초보자 기준으로 적었다. 순서대로 따라 하면 같은 구조를 다시 만들 수 있다.

## 0. 전체 구조 한눈에 보기

최종 구조는 아래와 같다.

```text
Supabase
  실제 Strava/Garmin 운동 데이터 저장
        ↓
React/Vite 대시보드 앱
  Supabase 데이터를 읽어서 화면, 통계, 차트를 그림
        ↓
GitHub
  코드 저장소
        ↓
Vercel
  GitHub 코드를 자동 배포
        ↓
휴대폰/컴퓨터 브라우저
  Vercel 주소로 대시보드 접속
```

각 서비스 역할은 이렇게 이해하면 된다.

```text
Supabase = 데이터베이스
GitHub   = 코드 보관소
Vercel   = 웹사이트 배포 서비스
로컬 PC  = 코드를 수정하고 테스트하는 곳
```

이번 대시보드는 Supabase의 실제 테이블만 읽는다. 가짜 데이터는 통계에 사용하지 않는다.

## 1. 처음 시작 파일

처음 받은 파일은 Gemini Canvas에서 만든 단일 React 파일이었다.

```text
C:\Users\najon\Downloads\strava.tsx
```

이 파일에는 대시보드 화면 대부분이 들어 있었다.

```text
KPI 카드
운동 목록
월별 거리 그래프
페이스 그래프
심박수 분석
운동 상세 모달
```

하지만 `strava.tsx` 파일 하나만으로는 Vercel에 바로 배포하기 어렵다. 그래서 React/Vite 프로젝트 구조로 감싸야 한다.

## 2. 프로젝트 폴더 만들기

작업 폴더는 아래 위치를 사용했다.

```text
C:\Users\najon\Documents\strava
```

이 폴더 안에 배포용 React 프로젝트를 만든다.

최종 파일 구조는 아래처럼 된다.

```text
C:\Users\najon\Documents\strava
│
├─ package.json
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ postcss.config.cjs
├─ tailwind.config.cjs
├─ .gitignore
│
└─ src
   ├─ App.tsx
   ├─ main.tsx
   └─ styles.css
```

핵심 파일 역할은 아래와 같다.

```text
src/App.tsx
  대시보드 본체다.
  Gemini Canvas에서 받은 strava.tsx 내용을 여기로 옮긴다.
  Supabase 데이터 조회, 통계 계산, 차트 표시도 여기서 한다.

src/main.tsx
  React 앱을 브라우저 화면에 붙이는 시작 파일이다.

src/styles.css
  Tailwind CSS를 불러오는 파일이다.

index.html
  브라우저가 처음 여는 HTML 파일이다.

package.json
  npm install, npm run dev, npm run build 같은 명령과 필요한 패키지를 적는 파일이다.

vite.config.ts
  Vite가 React 앱을 빌드하도록 알려주는 설정 파일이다.

.gitignore
  node_modules, dist, .env 같은 파일을 GitHub에 올리지 않게 하는 파일이다.
```

## 3. 기본 파일 만들기

아래 파일들은 Codex에게 만들어달라고 하면 된다. 직접 코드를 전부 외울 필요는 없다.

요청 예시:

```text
Gemini Canvas에서 받은 strava.tsx를 Vercel에 배포 가능한 React/Vite 프로젝트로 만들어줘.
src/App.tsx에 대시보드 본문을 넣고, package.json, index.html, vite.config.ts,
src/main.tsx, src/styles.css, Tailwind 설정, .gitignore까지 만들어줘.
```

Codex가 만들어야 하는 파일:

```text
package.json
index.html
vite.config.ts
tsconfig.json
tsconfig.node.json
postcss.config.cjs
tailwind.config.cjs
.gitignore
src/App.tsx
src/main.tsx
src/styles.css
```

이 단계에서 직접 코드를 하나하나 작성할 필요는 없다. 핵심은 `strava.tsx`를 `src/App.tsx`로 옮기고, Vercel이 이해할 수 있는 React/Vite 프로젝트 구조를 갖추는 것이다.

## 4. Canvas 파일 옮기기

Gemini Canvas에서 받은 파일:

```text
C:\Users\najon\Downloads\strava.tsx
```

이 파일 내용을 아래 위치로 옮긴다.

```text
C:\Users\najon\Documents\strava\src\App.tsx
```

즉, `strava.tsx`가 대시보드 본체가 되고, 이름만 `App.tsx`로 바뀐다고 보면 된다.

## 5. 로컬에서 실행하기

PowerShell을 열고 프로젝트 폴더로 이동한다.

```powershell
cd C:\Users\najon\Documents\strava
```

필요한 패키지를 설치한다.

```powershell
npm.cmd install
```

개발 서버를 실행한다.

```powershell
npm.cmd run dev
```

브라우저에서 아래 주소를 연다.

```text
http://localhost:5173
```

PowerShell에서 `npm`이 막히면 `npm.cmd`를 쓰면 된다.

## 6. Supabase 실제 데이터 연결

대시보드는 Supabase의 실제 테이블을 읽도록 만든다.

실제 테이블:

```text
public.activities
```

Vercel과 로컬 앱에서 사용할 환경변수 이름:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_TABLE
```

값은 이렇게 넣는다.

```text
VITE_SUPABASE_URL = Supabase Project URL
VITE_SUPABASE_ANON_KEY = Supabase anon public key
VITE_SUPABASE_TABLE = activities
```

Supabase 값 찾는 곳:

```text
Supabase → Project Settings → API
```

여기서:

```text
Project URL → VITE_SUPABASE_URL
anon public key → VITE_SUPABASE_ANON_KEY
```

주의:

```text
service_role key는 절대 브라우저 앱이나 Vercel 공개 환경변수에 넣지 않는다.
브라우저 앱에는 anon public key만 사용한다.
```

## 7. App.tsx에서 Supabase 읽기

이 부분도 직접 코드를 작성하기보다 Codex에게 맡기면 된다.

요청 예시:

```text
src/App.tsx를 수정해서 Supabase public.activities 테이블에서 실제 데이터만 불러오게 해줘.
Vercel 환경변수 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_TABLE을 사용하게 해줘.
테이블명 기본값은 activities로 해줘.
Supabase 기본 1000개 제한을 피하려고 range로 1000개씩 전체 데이터를 가져오게 해줘.
연결 실패 시 가짜 데이터는 넣지 말고 오류 메시지만 보여줘.
```

중요한 원칙:

```text
Supabase 연결에 실패하면 가짜 데이터를 넣지 않는다.
데이터가 없거나 오류가 있으면 화면에 오류를 보여준다.
통계에는 실제 Supabase 데이터만 사용한다.
```

## 8. Supabase RLS 정책 확인

Supabase에서 RLS가 켜져 있으면 `anon` 사용자가 `activities` 테이블을 읽을 수 있어야 한다.

기본 읽기 정책 예시:

```sql
create policy "Allow anon read activities"
on public.activities
for select
to anon
using (true);
```

개인 데이터 보호가 필요하면 `using (true)` 대신 사용자별 조건을 넣어야 한다.

## 9. GitHub에 올리기

GitHub에서 새 저장소를 만든다.

저장소 이름 예시:

```text
strava-dashboard
```

로컬 PowerShell에서 처음 한 번만 아래를 실행한다.

```powershell
cd C:\Users\najon\Documents\strava
git init
git add .
git commit -m "Initial Strava dashboard"
git branch -M main
git remote add origin https://github.com/najonghwa/strava-dashboard.git
git push -u origin main
```

이미 remote가 있으면 아래처럼 주소를 확인하거나 바꾼다.

```powershell
git remote -v
git remote set-url origin https://github.com/najonghwa/strava-dashboard.git
```

## 10. Vercel에 배포하기

Vercel에서 아래 순서로 진행한다.

```text
1. Vercel 로그인
2. Add New...
3. Project
4. GitHub 저장소 najonghwa/strava-dashboard 선택
5. Framework Preset이 Vite인지 확인
6. Deploy 클릭
```

기본 설정:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Root Directory: ./
```

배포가 끝나면 Vercel 주소가 생긴다.

예시:

```text
https://strava-dashboard.vercel.app
```

## 11. Vercel 환경변수 넣기

Vercel 프로젝트에서 아래로 이동한다.

```text
Project → Settings → Environment Variables
```

여기서 **Add Environment Variable** 버튼을 누르면 입력창이 나온다.

입력창에는 보통 아래 항목이 있다.

```text
Key
Value
Note
Sensitive
Environments
```

각 항목은 이렇게 이해하면 된다.

```text
Key
  환경변수 이름이다.
  예: VITE_SUPABASE_URL

Value
  실제 값이다.
  예: https://xxxxx.supabase.co

Note
  메모칸이다.
  비워둬도 된다.

Sensitive
  값을 화면에서 가릴지 정하는 옵션이다.
  켜둬도 된다.

Environments
  어떤 배포 환경에서 사용할지 정하는 옵션이다.
  Production and Preview를 선택하면 된다.
```

아래 3개를 하나씩 추가한다.

### 첫 번째 환경변수

```text
Key: VITE_SUPABASE_URL
Value: Supabase Project URL
```

예시 형태:

```text
https://abcdefghijklm.supabase.co
```

찾는 위치:

```text
Supabase → Project Settings → API → Project URL
```

### 두 번째 환경변수

```text
Key: VITE_SUPABASE_ANON_KEY
Value: Supabase anon public key
```

찾는 위치:

```text
Supabase → Project Settings → API → anon public key
```

주의:

```text
anon public key를 넣는다.
service_role key는 절대 넣지 않는다.
```

### 세 번째 환경변수

```text
Key: VITE_SUPABASE_TABLE
Value: activities
```

각 환경변수의 Environments는 아래처럼 둔다.

```text
Production and Preview
```

환경변수를 추가한 뒤에는 새 배포가 필요하다.

방법 1:

```text
Vercel → Deployments → 최신 배포 ... → Redeploy
```

방법 2:

```powershell
git commit --allow-empty -m "Redeploy"
git push
```

## 12. 수정하고 다시 배포하기

대시보드를 수정할 때는 보통 아래 파일을 고친다.

```text
src/App.tsx
```

수정 후 로컬에서 확인한다.

```powershell
npm.cmd run dev
```

문제가 없으면 GitHub에 올린다.

```powershell
git status
git add .
git commit -m "Update dashboard"
git push
```

`git push`가 끝나면 Vercel이 자동으로 새 배포를 시작한다.

## 13. 배포 확인하기

Vercel에서 확인한다.

```text
Project → Deployments
```

최신 배포가 아래 상태면 성공이다.

```text
Status: Ready
```

GitHub 최신 커밋과 Vercel 최신 배포가 같은지 확인한다.

PowerShell:

```powershell
git log --oneline -5
```

Vercel Deployments 화면에서 같은 커밋 메시지가 보이면 정상이다.

브라우저에 예전 화면이 계속 보이면 강력 새로고침한다.

```text
Ctrl + F5
```

## 14. 오늘 적용한 핵심 개선

현재 대시보드는 아래 상태로 정리되어 있다.

```text
Supabase public.activities 테이블에서 실제 데이터만 읽음
가짜 데이터 fallback 제거
Supabase 연결 실패 시 화면 상단에 오류 표시
1000개 이상 데이터도 전체 조회
페이스 6:60 표시 문제 수정
페이스 차트 점과 선 좌표 정렬
페이스 차트에 X축/Y축 정보 추가
Vercel 환경변수로 Supabase 연결 정보 관리
```

페이스 포맷은 전체 초로 변환한 뒤 다시 분/초로 나눈다.

예시:

```text
6.999분/km → 7:00/km
```

## 15. 체크리스트

완성 후 아래를 확인한다.

```text
대시보드에 Supabase 연결 실패 메시지가 없는가
총 운동수가 Supabase 실제 데이터 개수와 비슷한가
최근 운동 기록이 Supabase 최신 기록과 맞는가
가짜 운동 데이터가 통계에 섞이지 않는가
페이스가 6:60처럼 표시되지 않는가
페이스 그래프의 점과 선이 맞게 겹치는가
Vercel 최신 배포가 GitHub 최신 커밋인지 확인했는가
```

## 16. 자주 헷갈리는 것

### npm이 PowerShell에서 안 될 때

아래처럼 `npm.cmd`를 쓴다.

```powershell
npm.cmd install
npm.cmd run dev
```

### GitHub에는 올라갔는데 Vercel 화면이 안 바뀔 때

확인 순서:

```text
1. git push가 성공했는지 확인
2. Vercel Deployments에 최신 커밋이 있는지 확인
3. 배포 상태가 Ready인지 확인
4. 브라우저에서 Ctrl + F5
```

### Vercel 프로젝트가 2개 생겼을 때

같은 GitHub 저장소로 프로젝트를 여러 개 만들면 헷갈린다.

하나만 남긴다.

```text
남길 프로젝트: strava-dashboard
삭제할 프로젝트: 사용하지 않는 중복 프로젝트
```

환경변수도 반드시 남길 프로젝트에 들어 있어야 한다.

### 총 운동수가 1000으로 딱 떨어질 때

Supabase 기본 조회 제한 때문에 1000개까지만 읽었을 가능성이 있다.

이 프로젝트는 `.range()`를 이용해 1000개씩 전체 데이터를 가져오도록 수정되어 있다.

## 17. 다음에 다시 만들 때 최단 순서

완전히 처음부터 다시 한다면 아래 순서로 하면 된다.

```text
1. Gemini Canvas에서 strava.tsx 받기
2. C:\Users\najon\Documents\strava 폴더 만들기
3. React/Vite 기본 파일 만들기
4. strava.tsx 내용을 src/App.tsx로 옮기기
5. Supabase 연결 코드 추가
6. npm.cmd install
7. npm.cmd run dev로 로컬 확인
8. GitHub 저장소 만들기
9. git init / add / commit / push
10. Vercel에서 GitHub 저장소 Import
11. Vercel Environment Variables에 Supabase 값 입력
12. Redeploy
13. 실제 데이터가 나오는지 확인
```

이미 만들어진 프로젝트를 수정하는 경우에는 더 짧다.

```text
1. src/App.tsx 수정
2. npm.cmd run dev로 확인
3. git add .
4. git commit -m "Update dashboard"
5. git push
6. Vercel 자동 배포 확인
```
