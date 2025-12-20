from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)  # CORS 허용

# 데이터베이스 파일 경로
DB_PATH = 'student.db'

# 데이터베이스 초기화 및 DB 연결 헬퍼
import urllib.parse

def get_conn():
    """지원 DB에 따라 sqlite 또는 postgres 연결을 반환합니다. 반환값: (conn, engine)
    engine: 'sqlite' or 'postgres'"""
    db_url = os.getenv('DATABASE_URL')
    if db_url and db_url.startswith('postgres'):
        import psycopg2
        # psycopg2가 설치되어야 함 (requirements.txt에 포함)
        conn = psycopg2.connect(db_url, sslmode='require')
        return conn, 'postgres'
    else:
        conn = sqlite3.connect(DB_PATH)
        return conn, 'sqlite'


def init_db():
    conn, engine = get_conn()
    cursor = conn.cursor()

    if engine == 'sqlite':
        # student_number 컬럼을 포함한 테이블 생성 (마이그레이션을 대비해 안전하게 추가)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_number TEXT,
                phone TEXT NOT NULL,
                name TEXT NOT NULL,
                booths TEXT NOT NULL,
                total_price INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        # 기존 DB에 student_number 컬럼이 없으면 추가 (마이그레이션)
        cursor.execute("PRAGMA table_info(students)")
        cols = [row[1] for row in cursor.fetchall()]
        if 'student_number' not in cols:
            cursor.execute("ALTER TABLE students ADD COLUMN student_number TEXT")
            conn.commit()
    else:
        # postgres 용 테이블 생성 (JSONB 사용)
        cursor.execute('''
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
        conn.commit()
        # 컬럼 추가가 필요한 경우 안전하게 추가
        cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS student_number TEXT")
        conn.commit()

    cursor.close()
    conn.close()
    print('데이터베이스 초기화 완료')

# 앱 시작 시 초기화 (gunicorn에서도 동작하도록 설정)
@app.before_first_request
def _init_on_start():
    init_db()

# 정적 파일 제공 (HTML 파일)
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# 학생 데이터 저장 API
@app.route('/api/save-student', methods=['POST'])
def save_student():
    try:
        data = request.json
        phone = data.get('phone')
        name = data.get('name')
        student_number = data.get('student_number')
        booths = data.get('booths')
        total_price = data.get('totalPrice')

        # 입력 검증
        import re
        if not phone or not name or not booths or len(booths) == 0 or not student_number:
            return jsonify({
                'success': False,
                'message': '필수 정보가 누락되었습니다.'
            }), 400

        # 학번(5자리) 검증
        if not re.match(r'^\d{5}$', str(student_number)):
            return jsonify({
                'success': False,
                'message': '학번은 숫자 5자리여야 합니다.'
            }), 400

        # 부스별 초기 남은 횟수 계산
        def parse_initial_uses(booth):
            # booth는 {number, name, price}
            name = booth.get('name','')
            # 찾는 패턴: 3회, 2회, 1회 또는 [3회], [1인]
            m = re.search(r"(\d+)회|\[(\d+)회\]|(\d+)인|\[(\d+)인\]", name)
            if m:
                for g in m.groups():
                    if g and g.isdigit():
                        return int(g)
            # 특별 케이스: PASS 명칭에 따라 기본값 변경(없으면 1)
            if 'SUPER' in name.upper() or 'SUPERPASS' in name.upper():
                return 1
            return 1

        # 보관할 부스 정보에 remaining 추가
        processed_booths = []
        for b in booths:
            remaining = parse_initial_uses(b)
            pb = {
                'number': b.get('number'),
                'name': b.get('name'),
                'price': b.get('price'),
                'remaining': remaining
            }
            # 프론트엔드에서 전달할 수 있는 추가 플래그 보존 (isGolden, derived 등)
            for optional_key in ('isGolden','derived','derivedFrom','goldenFrom'):
                if optional_key in b:
                    pb[optional_key] = b.get(optional_key)
            processed_booths.append(pb)

        # 부스 정보를 JSON 문자열로 변환
        import json
        booths_json = json.dumps(processed_booths, ensure_ascii=False)

        # 총액 보장
        if total_price is None:
            try:
                total_price = sum(int(b.get('price', 0)) for b in processed_booths)
            except Exception:
                total_price = 0

        # 데이터베이스에 저장 또는 병합 (같은 학번의 기존 레코드가 있으면 remaining만 증가)
        conn, engine = get_conn()
        # 최근 레코드를 찾아 병합
        if engine == 'sqlite':
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT id, booths, total_price FROM students WHERE student_number = ? ORDER BY created_at DESC LIMIT 1', (student_number,))
            existing = cursor.fetchone()
        else:
            import psycopg2.extras
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute('SELECT id, booths, total_price FROM students WHERE student_number = %s ORDER BY created_at DESC LIMIT 1', (student_number,))
            existing = cursor.fetchone()

        if existing:
            existing_id = existing['id'] if engine != 'sqlite' else existing[0]
            existing_booths = []
            try:
                existing_booths = json.loads(existing['booths'] if engine != 'sqlite' else existing[1])
            except Exception:
                existing_booths = []
            existing_total = (existing['total_price'] if engine != 'sqlite' else existing[2]) or 0

            # 병합 로직: 동일 번호의 부스가 있으면 remaining 증가, 없으면 추가
            for pb in processed_booths:
                matched = False
                for eb in existing_booths:
                    if eb.get('number') == pb.get('number'):
                        eb['remaining'] = int(eb.get('remaining', 0)) + int(pb.get('remaining', 0))
                        # incoming에 황금/파생 플래그가 있으면 보존/갱신
                        for k in ('isGolden','goldenFrom','derived','derivedFrom'):
                            if k in pb:
                                eb[k] = pb[k]
                        matched = True
                        break
                if not matched:
                    existing_booths.append(pb)

            new_total = existing_total + total_price
            booths_json = json.dumps(existing_booths, ensure_ascii=False)
            if engine == 'sqlite':
                cursor.execute('UPDATE students SET booths = ?, total_price = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?', (booths_json, new_total, existing_id))
            else:
                cursor.execute('UPDATE students SET booths = %s, total_price = %s, created_at = CURRENT_TIMESTAMP WHERE id = %s', (booths_json, new_total, existing_id))
            conn.commit()
            student_id = existing_id
            conn.close()

            print(f'학생 데이터 업데이트 완료: ID {student_id}, 학번: {student_number}, 추가 금액: {total_price}')
            return jsonify({
                'success': True,
                'message': '기존 기록에 횟수가 추가되었습니다.',
                'id': student_id
            })
        else:
            if engine == 'sqlite':
                cursor.execute('''
                    INSERT INTO students (student_number, phone, name, booths, total_price)
                    VALUES (?, ?, ?, ?, ?)
                ''', (student_number, phone, name, booths_json, total_price))
                conn.commit()
                student_id = cursor.lastrowid
            else:
                cursor.execute('''
                    INSERT INTO students (student_number, phone, name, booths, total_price)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id
                ''', (student_number, phone, name, booths_json, total_price))
                student_id = cursor.fetchone()['id']
                conn.commit()
            conn.close()

            print(f'학생 데이터 저장 완료: ID {student_id}, 학번: {student_number}, 이름: {name}, 전화번호: {phone}')
            
            return jsonify({
                'success': True,
                'message': '데이터가 성공적으로 저장되었습니다.',
                'id': student_id
            })

    except Exception as e:
        print(f'데이터 저장 오류: {str(e)}')
        return jsonify({
            'success': False,
            'message': f'데이터 저장 중 오류가 발생했습니다: {str(e)}'
        }), 500

# 학생 목록 조회 API
@app.route('/api/students', methods=['GET'])
def get_students():
    try:
        student_number = request.args.get('student_number')
        search = request.args.get('search')

        conn, engine = get_conn()
        students = []
        import json
        if engine == 'sqlite':
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            if student_number:
                cursor.execute('SELECT * FROM students WHERE student_number = ? ORDER BY created_at DESC', (student_number,))
            elif search:
                like = f"%{search}%"
                cursor.execute('SELECT * FROM students WHERE name LIKE ? OR student_number LIKE ? ORDER BY created_at DESC', (like, like))
            else:
                cursor.execute('SELECT * FROM students ORDER BY created_at DESC')
            rows = cursor.fetchall()
            for row in rows:
                booths = []
                try:
                    booths = json.loads(row['booths'])
                except Exception:
                    booths = []
                student = {
                    'id': row['id'],
                    'student_number': row['student_number'],
                    'phone': row['phone'],
                    'name': row['name'],
                    'booths': booths,
                    'total_price': row['total_price'],
                    'created_at': row['created_at']
                }
                students.append(student)
            conn.close()
        else:
            import psycopg2.extras
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if student_number:
                cursor.execute('SELECT * FROM students WHERE student_number = %s ORDER BY created_at DESC', (student_number,))
            elif search:
                like = f"%{search}%"
                cursor.execute('SELECT * FROM students WHERE name LIKE %s OR student_number LIKE %s ORDER BY created_at DESC', (like, like))
            else:
                cursor.execute('SELECT * FROM students ORDER BY created_at DESC')
            rows = cursor.fetchall()
            for row in rows:
                booths = []
                try:
                    if isinstance(row['booths'], str):
                        booths = json.loads(row['booths'])
                    else:
                        booths = row['booths']
                except Exception:
                    booths = []
                student = {
                    'id': row['id'],
                    'student_number': row.get('student_number'),
                    'phone': row.get('phone'),
                    'name': row.get('name'),
                    'booths': booths,
                    'total_price': row.get('total_price'),
                    'created_at': row.get('created_at')
                }
                students.append(student)
            conn.close()

        return jsonify({
            'success': True,
            'data': students
        })

    except Exception as e:
        print(f'데이터 조회 오류: {str(e)}')
        return jsonify({ 'success': False, 'message': f'데이터 조회 중 오류가 발생했습니다: {str(e)}' }), 500

# 단일 학생 레코드 조회
@app.route('/api/students/<int:student_id>', methods=['GET'])
def get_student(student_id):
    try:
        conn, engine = get_conn()
        if engine == 'sqlite':
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM students WHERE id = ?', (student_id,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return jsonify({ 'success': False, 'message': '학생을 찾을 수 없습니다.' }), 404
            import json
            booths = []
            try:
                booths = json.loads(row['booths'])
            except Exception:
                booths = []
            student = {
                'id': row['id'],
                'student_number': row['student_number'],
                'phone': row['phone'],
                'name': row['name'],
                'booths': booths,
                'total_price': row['total_price'],
                'created_at': row['created_at']
            }
            return jsonify({ 'success': True, 'data': student })
        else:
            import psycopg2.extras, json
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute('SELECT * FROM students WHERE id = %s', (student_id,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return jsonify({ 'success': False, 'message': '학생을 찾을 수 없습니다.' }), 404
            booths = []
            try:
                if isinstance(row['booths'], str):
                    booths = json.loads(row['booths'])
                else:
                    booths = row['booths']
            except Exception:
                booths = []
            student = {
                'id': row['id'],
                'student_number': row.get('student_number'),
                'phone': row.get('phone'),
                'name': row.get('name'),
                'booths': booths,
                'total_price': row.get('total_price'),
                'created_at': row.get('created_at')
            }
            return jsonify({ 'success': True, 'data': student })
    except Exception as e:
        print(f'데이터 조회 오류: {str(e)}')
        return jsonify({ 'success': False, 'message': f'데이터 조회 중 오류가 발생했습니다: {str(e)}' }), 500

# 부스 남은 횟수 조정 API
@app.route('/api/students/<int:student_id>/adjust', methods=['POST'])
def adjust_student_booth(student_id):
    try:
        data = request.json
        booth_number = data.get('booth_number')
        delta = data.get('delta', 0)
        if booth_number is None or not isinstance(delta, int):
            return jsonify({ 'success': False, 'message': '부스 번호와 정수 delta가 필요합니다.' }), 400

        conn, engine = get_conn()
        if engine == 'sqlite':
            cursor = conn.cursor()
            cursor.execute('SELECT booths FROM students WHERE id = ?', (student_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return jsonify({ 'success': False, 'message': '학생을 찾을 수 없습니다.' }), 404
            import json
            try:
                booths = json.loads(row[0])
            except Exception:
                booths = []
        else:
            import psycopg2.extras, json
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute('SELECT booths FROM students WHERE id = %s', (student_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return jsonify({ 'success': False, 'message': '학생을 찾을 수 없습니다.' }), 404
            try:
                if isinstance(row['booths'], str):
                    booths = json.loads(row['booths'])
                else:
                    booths = row['booths']
            except Exception:
                booths = []

        updated = False
        for b in booths:
            if b.get('number') == booth_number:
                new_remain = max(0, int(b.get('remaining', 0)) + delta)
                b['remaining'] = new_remain
                updated = True
                break

        if not updated:
            conn.close()
            return jsonify({ 'success': False, 'message': '해당 부스를 찾을 수 없습니다.' }), 404

        booths_json = json.dumps(booths, ensure_ascii=False)
        if engine == 'sqlite':
            cursor.execute('UPDATE students SET booths = ? WHERE id = ?', (booths_json, student_id))
        else:
            cursor.execute('UPDATE students SET booths = %s WHERE id = %s', (booths_json, student_id))
        conn.commit()
        conn.close()

        return jsonify({ 'success': True, 'message': '부스 남은 횟수가 업데이트되었습니다.', 'data': booths })
    except Exception as e:
        print(f'부스 조정 오류: {str(e)}')
        return jsonify({ 'success': False, 'message': f'부스 조정 중 오류가 발생했습니다: {str(e)}' }), 500

# 결제 금액 추가 API
@app.route('/api/students/<int:student_id>/add-payment', methods=['POST'])
def add_payment(student_id):
    try:
        data = request.json
        amount = data.get('amount')
        if amount is None:
            return jsonify({'success': False, 'message': 'amount가 필요합니다.'}), 400
        try:
            amount = int(amount)
        except Exception:
            return jsonify({'success': False, 'message': 'amount는 정수여야 합니다.'}), 400

        conn, engine = get_conn()
        if engine == 'sqlite':
            cursor = conn.cursor()
            cursor.execute('SELECT total_price FROM students WHERE id = ?', (student_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': '학생을 찾을 수 없습니다.'}), 404
            existing_total = row[0] or 0
            new_total = existing_total + amount
            cursor.execute('UPDATE students SET total_price = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?', (new_total, student_id))
        else:
            import psycopg2.extras
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute('SELECT total_price FROM students WHERE id = %s', (student_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': '학생을 찾을 수 없습니다.'}), 404
            existing_total = row['total_price'] or 0
            new_total = existing_total + amount
            cursor.execute('UPDATE students SET total_price = %s, created_at = CURRENT_TIMESTAMP WHERE id = %s', (new_total, student_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': '결제가 적용되었습니다.', 'total_price': new_total})
    except Exception as e:
        print(f'결제 추가 오류: {str(e)}')
        return jsonify({'success': False, 'message': f'결제 추가 중 오류가 발생했습니다: {str(e)}'}), 500

# 학생 레코드 삭제 API
@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    try:
        conn, engine = get_conn()
        if engine == 'sqlite':
            cursor = conn.cursor()
            cursor.execute('DELETE FROM students WHERE id = ?', (student_id,))
            if cursor.rowcount == 0:
                conn.close()
                return jsonify({'success': False, 'message': '학생을 찾을 수 없습니다.'}), 404
        else:
            import psycopg2.extras
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute('DELETE FROM students WHERE id = %s RETURNING id', (student_id,))
            res = cursor.fetchone()
            if not res:
                conn.close()
                return jsonify({'success': False, 'message': '학생을 찾을 수 없습니다.'}), 404
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': '레코드가 삭제되었습니다.'})
    except Exception as e:
        print(f'삭제 오류: {str(e)}')
        return jsonify({'success': False, 'message': f'삭제 중 오류가 발생했습니다: {str(e)}'}), 500

if __name__ == '__main__':
    # 데이터베이스 초기화
    init_db()
    
    print('=' * 50)
    print('부스 키오스크 서버 시작')
    print('=' * 50)
    print(f'서버 주소: http://localhost:5500')
    print('브라우저에서 위 주소로 접속하세요.')
    print('서버를 종료하려면 Ctrl+C를 누르세요.')
    print('=' * 50)
    
    # 서버 실행
    app.run(host='0.0.0.0', port=5500, debug=True)
