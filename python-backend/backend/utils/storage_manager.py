import oracledb
import json
from pathlib import Path
from datetime import datetime
import os
from dotenv import load_dotenv
load_dotenv()

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
            'user': os.getenv('DB_USER'),
            'password': os.getenv('DB_PASSWORD'),
            'dsn': os.getenv('DB_DSN')
        }
        if not self.db_config['user'] or not self.db_config['password'] or not self.db_config['dsn']:
            raise ValueError("❌ DB 환경변수가 설정되지 않았습니다. python-backend/.env 파일을 확인하세요.")
        
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
    
    def save_complete_event(self, event_data):
        """완전한 이벤트 저장 (DB + JSON)"""

        audio_id = None
        event_id = None

        if event_data.get('isCrying', False):
            conn = self.get_connection()

            if conn:
                try:
                    cursor = conn.cursor()

                    # ✅ 이제는 infant_id, guardian_id가 이미 존재한다고 "신뢰"
                    infant_id = event_data.get('infant_id')
                    guardian_id = event_data.get('guardian_id')

                    if not infant_id:
                        print("⚠️ infant_id가 전달되지 않았습니다. DB 저장을 건너뜁니다.")
                    else:
                        # 🔥 더 이상 ensure_infant_exists 호출 안 함
                        # if not self.ensure_infant_exists(conn, infant_id, guardian_id):
                        #     ...

                        # audio_file 저장
                        audio_id_var = cursor.var(oracledb.NUMBER)
                        cursor.execute(
                            """
                            INSERT INTO audio_file (
                                infant_id, storage_uri, duration_ms, 
                                sample_rate, upload_time
                            )
                            VALUES (:1, :2, :3, :4, SYSTIMESTAMP)
                            RETURNING audio_id INTO :5
                            """,
                            [
                                infant_id,
                                event_data.get('storage_uri', ''),
                                event_data.get('duration', 0) * 1000,
                                event_data.get('sample_rate', 16000),
                                audio_id_var,
                            ],
                        )
                        audio_id = int(audio_id_var.getvalue()[0])

                        # cry_event 저장
                        event_id_var = cursor.var(oracledb.NUMBER)
                        cursor.execute(
                            """
                            INSERT INTO cry_event (
                                infant_id, event_time, duration_ms, confidence,
                                severity, cry_type, detected_by, is_resolved
                            )
                            VALUES (:1, SYSTIMESTAMP, :2, :3, :4, :5, :6, 0)
                            RETURNING event_id INTO :7
                            """,
                            [
                                infant_id,
                                event_data.get('duration', 0) * 1000,
                                event_data.get('confidence', 0.0),
                                event_data.get('severity', 'Unknown'),
                                event_data.get('reason', 'unknown'),
                                'model',
                                event_id_var,
                            ],
                        )
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
    
    def get_action_stats(self, infant_id, days=7):
        """
        특정 아기에 대해 최근 N일 동안 실행된 조치(action_log)를
        울음 원인(cry_type) + action_detail 단위로 묶어서
        시행 횟수 / 성공 횟수를 집계해서 반환합니다.
        
        반환 형식 예시:
        {
          "hungry": [
            {
              "detail": "수유 후 안아서 트림 시키기",
              "trials": 5,
              "success": 4,
              "fail": 1,
              "success_rate": 0.8
            },
            ...
          ],
          "tired": [
            ...
          ]
        }
        """
        conn = self.get_connection()
        if not conn:
            return {}

        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    e.cry_type,
                    a.action_detail,
                    a.result
                FROM action_log a
                JOIN cry_event e
                  ON a.event_id = e.event_id
                WHERE e.infant_id = :infant_id
                  AND e.event_time >= SYSDATE - :days
                """,
                [infant_id, days]
            )
            rows = cursor.fetchall()

            stats = {}  # { cry_type: { detail: {trials, success, fail} } }

            for cry_type, action_detail, result in rows:
                if not cry_type:
                    cry_type = 'unknown'
                if not action_detail:
                    continue

                if cry_type not in stats:
                    stats[cry_type] = {}

                if action_detail not in stats[cry_type]:
                    stats[cry_type][action_detail] = {
                        "detail": action_detail,
                        "trials": 0,
                        "success": 0,
                        "fail": 0,
                    }

                entry = stats[cry_type][action_detail]
                entry["trials"] += 1

                res = (result or "").lower()
                if res == "success":
                    entry["success"] += 1
                elif res == "fail":
                    entry["fail"] += 1

            # success_rate 계산 + 리스트 형태로 변환
            result_dict = {}
            for cry_type, actions_dict in stats.items():
                actions_list = []
                for detail, entry in actions_dict.items():
                    trials = entry["trials"]
                    success = entry["success"]
                    success_rate = success / trials if trials > 0 else 0.0
                    actions_list.append({
                        **entry,
                        "success_rate": success_rate,
                    })

                # 성공률 + 시행 횟수 기준으로 정렬
                actions_list.sort(
                    key=lambda x: (x["success_rate"], x["trials"]),
                    reverse=True
                )
                result_dict[cry_type] = actions_list

            return result_dict

        except Exception as e:
            print(f"⚠️ get_action_stats 실패: {e}")
            return {}
        finally:
            conn.close()


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