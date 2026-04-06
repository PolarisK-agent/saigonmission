# 사이공선교교회 배포/운영 체크리스트

## 1) Cloudflare Pages 프로젝트 생성

- GitHub 저장소 연결 완료
- Production branch: main
- Framework preset: None
- Build command: (비워둠)
- Build output directory: /
- Root directory: /

## 1-1) Workers 환경변수 설정

- YOUTUBE_CHANNEL_ID
- YOUTUBE_CHANNEL_URL
- SERMON_MAX_ITEMS
- SERMON_KEYWORDS
- SENIOR_PASTOR_KEYWORDS
- EXCLUDE_KEYWORDS
- REMOVE_ENGLISH_CHURCH_NAMES

## 2) 첫 배포 확인

- 랜딩페이지가 정상 로딩되는지 확인
- `/api/sermons` 호출 시 JSON이 내려오는지 확인
- 설교 유튜브 섹션 카드가 보이는지 확인
- 지도(2곳) 임베드가 보이는지 확인
- 모바일 화면에서도 레이아웃이 무너지지 않는지 확인

## 3) 자동 설교 업데이트 확인

- GitHub Actions > Update Sermons Data 수동 실행
- 실행 후 data/sermons.json 커밋 생성 확인
- Cloudflare Pages 자동 재배포 트리거 확인
- 사이트에서 설교 카드 목록 갱신 확인

## 4) 도메인 연결(선택)

- Custom domain 추가
- DNS 레코드 연결 확인
- HTTPS(Universal SSL) 활성 상태 확인

## 5) 캐시/문제 대응

- 설교 목록이 안 바뀌면 Cloudflare Purge cache 실행
- GitHub Actions 로그에서 update-sermons 성공 여부 확인
- videos 페이지 파싱 실패 시 tools/update-sermons.mjs 로그 확인

## 6) 정기 점검 (월 1회 권장)

- 최근 설교가 정상 반영되는지
- 지도/연락처 정보 최신인지
- 링크 깨짐 여부
- GitHub Actions 실패 이력 여부
