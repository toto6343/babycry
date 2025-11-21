import oracledb
import json
from pathlib import Path
from datetime import datetime
import os

# ⭐ Oracle Thick 모드 초기화 (모듈 로드 시 한 번만 실행)
_oracle_thick_initialized = False

def init_oracle_thick_mode():
    """Oracle Thick 모드 초기화 (XE 버전 지원)"""
    global _oracle_thick_initialized
    
    if _oracle_thick_initialized:
        return
    
    try:
        # 환경변수에서 Oracle Client 경로 읽기
        oracle_client_path = os.getenv('ORACLE_CLIENT_PATH', None)
        
        # 경로가 지정되지 않으면 일반적인 경로들 시도
        if not oracle_client_path:
            possible_paths = [
                r'C:\oracle\instantclient_21_13',
                r'C:\oracle\instantclient_19_21',
                r'C:\oracle\instantclient_21_3',
                r'C:\instantclient_21_13',
                r'C:\instantclient_19_21',
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    oracle_client_path = path
                    print(f"✅ Found Oracle Client at: {oracle_client_path}")
                    break
        
        # Thick 모드 초기화
        if oracle_client_path and os.path.exists(oracle_client_path):
            oracledb.init_oracle_client(lib_dir=oracle_client_path)
            print(f"✅ Oracle Thick mode initialized with: {oracle_client_path}")
        else:
            # 경로 없이 시도 (PATH에 등록된 경우)
            oracledb.init_oracle_client()
            print("✅ Oracle Thick mode initialized (using PATH)")
        
        _oracle_thick_initialized = True
        
    except Exception as e:
        # 이미 초기화되었거나 다른 오류
        if "already been initialized" in str(e).lower():
            print("ℹ️  Oracle Client already initialized")
            _oracle_thick_initialized = True
        else:
            print(f"⚠️  Oracle Thick mode initialization failed: {e}")
            print("   Attempting to continue with Thin mode (may not support XE)")

# 모듈 로드 시 자동 초기화
init_oracle_thick_mode()


class StorageManager:
    """DB + JSON 하이브리드 저장소"""
    
    def __init__(self):
        self.db_config = {
            'user': os.getenv('DB_USER', 'babycry'),
            'password': os.getenv('DB_PASSWORD', '1234'),
            'dsn': os.getenv('DB_DSN', 'localhost:1521/XE')
        }
        
        # JSON 백업 경로
        self.json_path = Path(__file__).parents[1] / 'data' / 'cry_history.json'
        self.json_path.parent.mkdir(exist_ok=True)
        
        print(f"📦 StorageManager initialized")
        print(f"   DB DSN: {self.db_config['dsn']}")
        print(f"   JSON backup: {self.json_path}")
    
    def get_connection(self):
        """DB 연결"""
        try:
            conn = oracledb.connect(**self.db_config)
            print(f"✅ DB 연결 성공: {self.db_config['dsn']}")
            return conn
        except Exception as e:
            print(f"⚠️ DB 연결 실패: {e}")
            print(f"   DSN: {self.db_config['dsn']}")
            print(f"   User: {self.db_config['user']}")
            return None
    
    def ensure_guardian_exists(self, conn, guardian_id=1):
        """guardian_id가 존재하는지 확인하고 없으면 생성"""
        try:
            cursor = conn.cursor()
            
            # guardian_id 존재 확인
            cursor.execute("""
                SELECT COUNT(*) FROM guardian WHERE guardian_id = :1
            """, [guardian_id])
            
            count = cursor.fetchone()[0]
            
            if count == 0:
                # guardian 생성
                cursor.execute("""
                    INSERT INTO guardian (guardian_id, name, phone, email, notification_pref)
                    VALUES (:1, :2, :3, :4, 'both')
                """, [guardian_id, f'보호자 {guardian_id}', '010-0000-0000', f'guardian{guardian_id}@example.com'])
                
                conn.commit()
                print(f"✅ Created guardian_id={guardian_id} automatically")
            
            return True
            
        except Exception as e:
            print(f"⚠️ Failed to ensure guardian exists: {e}")
            return False
    
    def ensure_infant_exists(self, conn, infant_id, guardian_id=1):
        """infant_id가 존재하는지 확인하고 없으면 생성"""
        try:
            cursor = conn.cursor()
            
            # infant_id 존재 확인
            cursor.execute("""
                SELECT COUNT(*) FROM infant WHERE infant_id = :1
            """, [infant_id])
            
            count = cursor.fetchone()[0]
            
            if count == 0:
                # ⭐ 먼저 guardian이 존재하는지 확인
                if not self.ensure_guardian_exists(conn, guardian_id):
                    return False
                
                # infant 생성 (guardian_id는 필수)
                cursor.execute("""
                    INSERT INTO infant (infant_id, guardian_id, name, birth_date, gender)
                    VALUES (:1, :2, :3, SYSDATE, 'other')
                """, [infant_id, guardian_id, f'아기 {infant_id}'])
                
                conn.commit()
                print(f"✅ Created infant_id={infant_id} with guardian_id={guardian_id} automatically")
            
            return True
            
        except Exception as e:
            print(f"⚠️ Failed to ensure infant exists: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def save_complete_event(self, event_data):
        """완전한 이벤트 저장 (DB + JSON)"""
        
        # 1. DB 저장
        audio_id = None
        event_id = None
        
        if event_data.get('isCrying', False):
            conn = self.get_connection()
            
            if conn:
                try:
                    cursor = conn.cursor()
                    
                    # ⭐ infant_id 존재 여부 확인 및 생성
                    infant_id = event_data.get('infant_id', 1)
                    guardian_id = event_data.get('guardian_id', 1)  # guardian_id도 가져오기
                    
                    if not self.ensure_infant_exists(conn, infant_id, guardian_id):
                        print(f"⚠️ Could not ensure infant_id={infant_id} exists")
                        conn.close()
                        # JSON 백업으로 계속 진행
                    else:
                        # audio_file 저장
                        audio_id_var = cursor.var(oracledb.NUMBER)
                        cursor.execute("""
                            INSERT INTO audio_file (
                                infant_id, storage_uri, duration_ms, 
                                sample_rate, upload_time
                            )
                            VALUES (:1, :2, :3, :4, SYSTIMESTAMP)
                            RETURNING audio_id INTO :5
                        """, [
                            infant_id,
                            event_data.get('storage_uri', ''),
                            event_data.get('duration', 0) * 1000,
                            event_data.get('sample_rate', 16000),
                            audio_id_var
                        ])
                        audio_id = int(audio_id_var.getvalue()[0])
                        
                        # cry_event 저장
                        event_id_var = cursor.var(oracledb.NUMBER)
                        cursor.execute("""
                            INSERT INTO cry_event (
                                infant_id, event_time, duration_ms, confidence,
                                severity, cry_type, detected_by, is_resolved
                            )
                            VALUES (:1, SYSTIMESTAMP, :2, :3, :4, :5, :6, 'N')
                            RETURNING event_id INTO :7
                        """, [
                            infant_id,
                            event_data.get('duration', 0) * 1000,
                            event_data.get('confidence', 0.0),
                            event_data.get('severity', 'Unknown'),
                            event_data.get('reason', 'unknown'),
                            'model',
                            event_id_var
                        ])
                        event_id = int(event_id_var.getvalue()[0])
                        
                        conn.commit()
                        print(f"✅ DB 저장 완료: audio_id={audio_id}, event_id={event_id}")
                    
                except Exception as e:
                    print(f"⚠️ DB 저장 실패: {e}")
                    import traceback
                    traceback.print_exc()
                    conn.rollback()
                finally:
                    conn.close()
        
        # 2. JSON 백업
        event_data['audio_id'] = audio_id
        event_data['event_id'] = event_id
        
        try:
            if self.json_path.exists():
                with open(self.json_path, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            else:
                history = []
            
            history.append(event_data)
            
            # 최대 1000개 유지
            if len(history) > 1000:
                history = history[-1000:]
            
            with open(self.json_path, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
            
            print(f"✅ JSON 백업 완료: {len(history)}개")
            
        except Exception as e:
            print(f"⚠️ JSON 저장 실패: {e}")
        
        return event_data
    
    def get_history(self, infant_id, limit=50):
        """히스토리 조회"""
        conn = self.get_connection()
        
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT 
                        event_id, event_time, duration_ms, confidence,
                        severity, cry_type
                    FROM cry_event
                    WHERE infant_id = :1
                    ORDER BY event_time DESC
                    FETCH FIRST :2 ROWS ONLY
                """, [infant_id, limit])
                
                rows = cursor.fetchall()
                history = [
                    {
                        'event_id': row[0],
                        'timestamp': row[1].isoformat() if row[1] else None,
                        'duration': row[2] // 1000 if row[2] else 0,
                        'confidence': float(row[3]) if row[3] else 0.0,
                        'severity': row[4],
                        'cry_type': row[5]
                    }
                    for row in rows
                ]
                
                conn.close()
                return history
                
            except Exception as e:
                print(f"⚠️ DB 조회 실패: {e}")
                conn.close()
        
        # Fallback: JSON
        if self.json_path.exists():
            with open(self.json_path, 'r', encoding='utf-8') as f:
                history = json.load(f)
            return [h for h in history if h.get('infant_id') == infant_id][-limit:]
        
        return []
    
    def test_connection(self):
        """DB 연결 테스트"""
        conn = self.get_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT 'Connection OK' FROM DUAL")
                result = cursor.fetchone()
                conn.close()
                return True, result[0]
            except Exception as e:
                conn.close()
                return False, str(e)
        return False, "Connection failed"


# 싱글톤
_storage_instance = None

def get_storage_manager():
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = StorageManager()
    return _storage_instance