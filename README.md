# 사이공선교교회 홈페이지

Cloudflare Pages 무료 플랜에 배포할 수 있도록 만든 랜딩페이지입니다.
설교 목록은 Cloudflare Workers 런타임(Pages Functions)으로 서버리스 동적 조회됩니다.

## 핵심 구성

- `index.html`: 랜딩페이지 단일 페이지
- `assets/styles.css`: 반응형 UI 스타일
- `assets/main.js`: Workers API(`/api/sermons`) 우선 조회, 실패 시 `data/sermons.json` 폴백
- `functions/api/sermons.js`: Cloudflare Workers(Pages Functions) 유튜브 조회 API
- `data/sermons.json`: 실제 화면에 출력되는 설교 영상 데이터
- `tools/update-sermons.mjs`: 유튜브 채널 피드를 읽어 `sermons.json` 갱신
- `.github/workflows/update-sermons.yml`: 매주 자동 실행되는 GitHub Actions

## 설교 자동 업데이트 방식

기본 동작은 Cloudflare Workers(Pages Functions) API입니다.
정적 페이지에서 직접 유튜브를 부르지 않고 서버리스 함수가 대신 가져옵니다.

1. 브라우저가 `/api/sermons` 요청
2. Workers가 유튜브 목록을 조회하고 필터링(담임목사/설교 키워드)
3. 응답 JSON을 반환하고 캐시 적용
4. 프론트는 최근 10개를 먼저 표시, 더 보기로 과거 설교를 이어서 표시

보조 안전장치로 `data/sermons.json` 폴백을 유지했습니다.
Workers API 장애 시에도 화면이 완전히 비지 않도록 설계되어 있습니다.

## 최초 설정

1. `data/youtube.config.json`에서 필요 시 `titleKeyword`를 설교 제목 규칙에 맞게 수정
2. 현재 채널은 `@SaigonMissionChurch`로 이미 설정되어 있음
3. GitHub 저장소에 푸시
4. Cloudflare Pages에서 해당 저장소를 연결해 배포

## Cloudflare Pages 배포 설정값

Cloudflare Pages의 Create a project 화면에서 아래 값으로 설정하면 됩니다.

- Production branch: `main` (또는 실제 운영 브랜치)
- Framework preset: `None`
- Build command: 비워두기
- Build output directory: `/`
- Root directory: `/` (저장소 루트)

### Environment Variables (권장)

Cloudflare Pages > Settings > Environment variables 에 아래를 추가하면 필터를 운영 중에도 조정할 수 있습니다.

- `YOUTUBE_CHANNEL_ID`: `UC6oE7oR7nI1Ac9mUb40UFnw`
- `YOUTUBE_CHANNEL_URL`: `https://www.youtube.com/@SaigonMissionChurch`
- `SERMON_MAX_ITEMS`: `60`
- `SERMON_KEYWORDS`: `주일예배설교,주일 예배 설교,주일예배,주일 예배,예배설교,말씀`
- `SENIOR_PASTOR_KEYWORDS`: `장재식,담임목사`
- `EXCLUDE_KEYWORDS`: `유아세례,세례식,특강,세미나,간증,찬양,기도회,선교소식,광고`
- `REMOVE_ENGLISH_CHURCH_NAMES`: `Saigon Mission Church,Saigom Mission Church,Siaogon Mission Church`

정적 사이트이므로 빌드가 필요 없습니다. GitHub 연동 후 커밋이 올라오면 자동으로 재배포됩니다.

## 배포 후 체크리스트

1. 홈 화면의 설교 유튜브 섹션에 카드가 표시되는지 확인
2. 임의 커밋 후 Pages가 자동 배포되는지 확인
3. GitHub Actions에서 `Update Sermons Data` 워크플로 수동 실행해 `data/sermons.json`이 갱신되는지 확인
4. 갱신 커밋 이후 Cloudflare 배포가 자동으로 다시 수행되는지 확인

## 로컬 테스트

간단한 정적 서버로 확인할 수 있습니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속

정적 폴백 데이터 갱신 스크립트 테스트(선택):

```bash
npm run update:sermons
```

## 참고

- Cloudflare Pages 배포 시 `functions/api/sermons.js`가 자동으로 Workers 함수로 배포됩니다.
- `data/sermons.json`은 Workers API 장애 시 사용하는 폴백 데이터입니다.
