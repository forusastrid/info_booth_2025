"""
간단한 마이그레이션 스크립트
- 목적: 로컬 `student.db`(SQLite)에 있는 students 테이블을 PostgreSQL의 `students` 테이블로 복사
- 사용법:
  1) PostgreSQL 연결 문자열을 환경변수 `DATABASE_URL`에 설정
  2) python migrate_sqlite_to_postgres.py

주의: 덮어쓰기 위험이 있으므로 대상 DB에 중요한 데이터가 있으면 먼저 백업하세요.
"""
import os
import sqlite3
import json

DATABASE_URL = os.getenv('DATABASE_URL')
SQLITE_PATH = os.getenv('SQLITE_PATH', 'student.db')

if not DATABASE_URL:
    print('ERROR: DATABASE_URL 환경변수를 설정하세요 (Postgres).')
    exit(1)

import psycopg2
import psycopg2.extras

# 소스 읽기
s_conn = sqlite3.connect(SQLITE_PATH)
s_cursor = s_conn.cursor()
s_cursor.execute('SELECT id, student_number, phone, name, booths, total_price, created_at FROM students')
rows = s_cursor.fetchall()
print(f'로컬 SQLite에서 {len(rows)} 레코드 발견')

# 대상에 삽입
p_conn = psycopg2.connect(DATABASE_URL, sslmode='require')
p_cursor = p_conn.cursor()
# 테이블이 없으면 생성
p_cursor.execute('''
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    student_number TEXT,
    phone TEXT NOT NULL,
    name TEXT NOT NULL,
    booths JSONB NOT NULL,
    total_price INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')
p_conn.commit()

count = 0
for r in rows:
    sid, student_number, phone, name, booths, total_price, created_at = r
    try:
        # booths는 문자열인 경우가 대부분
        if isinstance(booths, str):
            booths_json = json.loads(booths)
        else:
            booths_json = booths
    except Exception:
        booths_json = []
    p_cursor.execute('INSERT INTO students (student_number, phone, name, booths, total_price, created_at) VALUES (%s,%s,%s,%s,%s,%s)',
                     (student_number, phone, name, json.dumps(booths_json, ensure_ascii=False), total_price, created_at))
    count += 1

p_conn.commit()
print(f'복사 완료: {count} 레코드')

s_conn.close()
p_cursor.close()
p_conn.close()
