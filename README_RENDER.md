Render 배포 가이드 (간단)

1) GitHub 레포 준비
- 이 폴더(캐치테이블) 전체를 GitHub에 푸시하세요.

2) Render에 프로젝트 연결
- Render 계정 생성 → New → Web Service
- Connect to GitHub → 레포 선택 → Branch 선택

3) Build & Start 설정
- Build Command: pip install -r requirements.txt
- Start Command: gunicorn -w 4 -b 0.0.0.0:$PORT app:app

4) 환경 변수 (Environment)
- (선택) PostgreSQL 사용 시: Add Database (Postgres) → 생성 후 DATABASE_URL 환경변수로 복사
- (선택) SECRET_KEY 설정: SECRET_KEY=your_secret

5) 데이터 마이그레이션 (SQLite → PostgreSQL)
- 로컬에서 기존 `student.db`가 있으면, Render에 Postgres가 준비된 후 `python migrate_sqlite_to_postgres.py`를 실행하여 데이터를 옮길 수 있습니다.

6) 확인
- 서비스가 배포되면 Render에서 제공하는 URL로 접속하세요. (HTTPS 자동 적용)
- 기능 테스트: 학생 등록 → 마이티켓 조회 → 관리자 검색/조정

참고
- SQLite는 간단한 테스트에는 괜찮지만, 프로덕션에서는 Postgres 권장 (동시성/안정성)
- 문제가 있으면 로그(Deploy → Live Logs)를 확인하세요.
