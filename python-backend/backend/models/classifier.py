import os
import numpy as np
import librosa
from pathlib import Path
import joblib
import warnings
warnings.filterwarnings('ignore')

"""
✅ 수정 사항 (2024):
- extract_features에 전처리 정규화 파이프라인 추가
- 업로드 파일과 녹음 파일의 일관성 개선
"""

class CryClassifier:
    """
    아기 울음소리 분류 모델 래퍼
    improved_v18.py의 V15_1AdaptivePredictor를 API에서 사용할 수 있도록 래핑
    """
    
    def __init__(self, dataset_path, sensitivity='balanced'):
        """
        Parameters:
        -----------
        dataset_path : str
            데이터셋 경로 (학습 시 필요, 예측만 할 경우 빈 문자열 가능)
        sensitivity : str
            'high', 'balanced', 'precise' 중 선택
        """
        self.dataset_path = Path(dataset_path) if dataset_path else None
        
        if sensitivity not in ['high', 'balanced', 'precise']:
            print(f"⚠️  Invalid sensitivity '{sensitivity}', using 'balanced'")
            sensitivity = 'balanced'
        
        self.sensitivity = sensitivity
        
        # 모델 컴포넌트 (load_model에서 초기화됨)
        self.detector = None
        self.stage1 = None
        self.cascade_filter = None
        self.stage2_nonpain = None
        
        self.scaler_phase1 = None
        self.scaler_stage1 = None
        self.scaler_cascade = None
        self.scaler_stage2 = None
        
        self.thresholds = None
        
        # 카테고리 매핑
        self.category_mapping = {
            'belly_pain': 'belly_pain',
            'cold_hot': 'cold_hot',
            'burping': 'burping',
            'discomfort': 'discomfort',
            'hungry': 'hungry',
            'tired': 'tired',
            'emotional': 'emotional'
        }
    
    def set_sensitivity(self, sensitivity):
        """민감도 모드 변경"""
        if sensitivity not in ['high', 'balanced', 'precise']:
            print(f"⚠️  Invalid sensitivity '{sensitivity}', keeping current")
            return
        
        old_sensitivity = self.sensitivity
        self.sensitivity = sensitivity
        print(f"✅ Sensitivity changed: {old_sensitivity} → {sensitivity}")
        
        if self.thresholds and 'cascade_thresholds' in self.thresholds:
            cascade_threshold = self.thresholds['cascade_thresholds'].get(sensitivity, 0.365)
            print(f"   Cascade threshold: {cascade_threshold:.3f}")
    
    def load_model(self, model_prefix: str):
        """
        저장된 모델 로드
        
        Parameters:
        -----------
        model_prefix : str
            모델 파일의 prefix (예: C:\\path\\to\\models\\baby_cry_v15_1)
            또는 전체 경로 (예: C:\\path\\to\\models\\baby_cry_v15_1_detector.pkl)
            
            ⭐ 수정: 전체 파일명이 전달되어도 자동으로 prefix 추출
        """
        try:
            # ⭐ 핵심 수정: _detector.pkl, _stage1_pain.pkl 등의 suffix 제거
            model_prefix = str(model_prefix)
            suffixes_to_remove = [
                '_detector.pkl',
                '_stage1_pain.pkl', 
                '_stage1_ensemble.pkl',
                '_scaler_phase1.pkl',
                '_scaler_stage1.pkl',
                '_cascade.pkl',
                '_scaler_cascade.pkl',
                '_nonpain.pkl',
                '_scaler_stage2.pkl',
                '_thresholds.pkl'
            ]
            
            for suffix in suffixes_to_remove:
                if model_prefix.endswith(suffix):
                    model_prefix = model_prefix[:-len(suffix)]
                    print(f"🔧 Removed suffix '{suffix}' from path")
                    break
            
            print(f"🔍 Loading models with prefix: {model_prefix}")
            
            # Phase 1: Cry Detection (필수)
            self.detector = joblib.load(f"{model_prefix}_detector.pkl")
            self.scaler_phase1 = joblib.load(f"{model_prefix}_scaler_phase1.pkl")
            print("✓ Loaded Phase 1: Cry Detection")
            
            # Stage 1: Pain Detection
            # ⭐ 핵심 수정: improved_v18.py는 _stage1_pain.pkl로 저장함
            stage1_loaded = False
            stage1_files_to_try = [
                f"{model_prefix}_stage1_pain.pkl",      # ✅ improved_v18.py가 저장하는 이름
                f"{model_prefix}_stage1_ensemble.pkl",  # 기존 이름 (호환성)
            ]
            
            for stage1_file in stage1_files_to_try:
                try:
                    self.stage1 = joblib.load(stage1_file)
                    print(f"✓ Loaded Stage 1: {Path(stage1_file).name}")
                    stage1_loaded = True
                    break
                except FileNotFoundError:
                    continue
            
            if not stage1_loaded:
                raise FileNotFoundError("Stage 1 pain detector model not found")
            
            # Scaler for Stage 1
            try:
                self.scaler_stage1 = joblib.load(f"{model_prefix}_scaler_stage1.pkl")
                print("✓ Loaded scaler_stage1")
            except FileNotFoundError:
                print("⚠ Warning: scaler_stage1 not found, using scaler_phase1")
                self.scaler_stage1 = self.scaler_phase1
            
            # Stage 1.5: Cascade Filter (선택사항)
            try:
                self.cascade_filter = joblib.load(f"{model_prefix}_cascade.pkl")
                print("✓ Loaded Cascade Filter")
            except FileNotFoundError:
                print("⚠ Warning: Cascade filter not found")
                self.cascade_filter = None
            
            # Scaler for Cascade
            try:
                self.scaler_cascade = joblib.load(f"{model_prefix}_scaler_cascade.pkl")
                print("✓ Loaded scaler_cascade")
            except FileNotFoundError:
                print("⚠ Warning: scaler_cascade not found, using scaler_stage1")
                self.scaler_cascade = self.scaler_stage1 if self.scaler_stage1 else self.scaler_phase1
            
            # Stage 2: Non-pain classification (선택사항)
            try:
                self.stage2_nonpain = joblib.load(f"{model_prefix}_nonpain.pkl")
                self.scaler_stage2 = joblib.load(f"{model_prefix}_scaler_stage2.pkl")
                print("✓ Loaded Stage 2: Non-pain classifier")
            except FileNotFoundError:
                print("⚠ Warning: Stage 2 models not found")
                self.stage2_nonpain = None
                self.scaler_stage2 = None
            
            # Thresholds
            try:
                self.thresholds = joblib.load(f"{model_prefix}_thresholds.pkl")
                print("✓ Loaded thresholds")
                
                if 'cascade_thresholds' in self.thresholds:
                    cascade_threshold = self.thresholds['cascade_thresholds'].get(self.sensitivity, 0.365)
                    print(f"   Current sensitivity: {self.sensitivity} (threshold={cascade_threshold:.3f})")
            except FileNotFoundError:
                print("⚠ Warning: Using default thresholds")
                self.thresholds = {
                    'pain_threshold_primary': 0.5,
                    'cascade_thresholds': {
                        'high': 0.25,
                        'balanced': 0.365,
                        'precise': 0.50
                    },
                    'confidence_threshold_low': 0.4,
                    'confidence_threshold_high': 0.7
                }
            
            print(f"✅ All models loaded successfully!")
            
        except FileNotFoundError as e:
            raise RuntimeError(f"Model load failed - File not found: {e}")
        except Exception as e:
            raise RuntimeError(f"Model load failed: {e}")
    
    def extract_features(self, audio_path, duration=3.0):
        """
        오디오 파일에서 특징 추출 (전처리 정규화 추가)
        
        ✅ 수정 사항:
        - 샘플링 레이트 통일 (22050 Hz)
        - 오디오 길이 정규화 (3초로 패딩/자르기)
        - RMS 정규화 (볼륨 통일)
        - 무음 구간 제거
        
        이 전처리 과정으로 업로드 파일과 녹음 파일의 분석 결과 일관성 향상
        """
        try:
            # ✅ 명시적으로 22050 Hz로 로드
            y, sr = librosa.load(audio_path, duration=duration, sr=22050)
            
            if len(y) == 0:
                return None
            
            # ✅ 1단계 고도화: 소음 정화 (Audio Denoising) - High-pass Filter
            # 아기 울음소리의 주파수 대역(주로 250Hz 이상)을 보존하고 저주파 배경 소음(에어컨, 냉장고 등)을 제거
            import scipy.signal as signal
            nyquist = sr / 2
            cutoff = 250.0  # 250Hz
            b, a = signal.butter(5, cutoff / nyquist, btype='highpass')
            y = signal.filtfilt(b, a, y)
            
            # ✅ 오디오 길이 정규화 (3초로 패딩 또는 자르기)
            target_length = int(sr * duration)
            if len(y) < target_length:
                # 짧으면 패딩
                y = np.pad(y, (0, target_length - len(y)), mode='constant')
            else:
                # 길면 자르기
                y = y[:target_length]
            
            # ✅ RMS 정규화 (볼륨 통일)
            rms = np.sqrt(np.mean(y**2))
            if rms > 0:
                y = y / rms * 0.1  # 0.1로 정규화
            
            # ✅ 무음 구간 제거 (선택적)
            y, _ = librosa.effects.trim(y, top_db=20)
            
            # 길이가 너무 짧아지면 다시 패딩
            if len(y) < target_length:
                y = np.pad(y, (0, target_length - len(y)), mode='constant')
            else:
                y = y[:target_length]
            
            features = []
            
            # MFCC (78 features)
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            features.extend([
                np.mean(mfcc, axis=1),
                np.std(mfcc, axis=1),
                np.max(mfcc, axis=1),
                np.min(mfcc, axis=1)
            ])
            
            mfcc_delta = librosa.feature.delta(mfcc)
            features.append(np.mean(mfcc_delta, axis=1))
            
            mfcc_delta2 = librosa.feature.delta(mfcc, order=2)
            features.append(np.mean(mfcc_delta2, axis=1))
            
            # Spectral (12 features)
            spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
            spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
            spectral_flatness = librosa.feature.spectral_flatness(y=y)[0]
            
            features.extend([
                [np.mean(spectral_centroids), np.std(spectral_centroids)],
                [np.mean(spectral_rolloff), np.std(spectral_rolloff)],
                [np.mean(spectral_bandwidth), np.std(spectral_bandwidth)],
                [np.mean(spectral_flatness), np.std(spectral_flatness), 
                 np.max(spectral_flatness), np.min(spectral_flatness)]
            ])
            
            # Energy (7 features)
            zcr = librosa.feature.zero_crossing_rate(y)[0]
            rms = librosa.feature.rms(y=y)[0]
            features.extend([
                [np.mean(zcr), np.std(zcr)],
                [np.mean(rms), np.std(rms), np.max(rms)]
            ])
            
            # Harmonic (8 features)
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
            mel = librosa.feature.melspectrogram(y=y, sr=sr)
            contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
            tonnetz = librosa.feature.tonnetz(y=y, sr=sr)
            
            features.extend([
                [np.mean(chroma), np.std(chroma)],
                [np.mean(mel), np.std(mel)],
                [np.mean(contrast), np.std(contrast)],
                [np.mean(tonnetz), np.std(tonnetz)]
            ])
            
            # Temporal (4 features)
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120)
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            features.extend([
                [tempo],
                [np.mean(onset_env), np.std(onset_env), np.max(onset_env)]
            ])
            
            feature_vector = np.concatenate([np.array(f).flatten() for f in features])
            feature_vector = np.nan_to_num(feature_vector, nan=0.0, posinf=0.0, neginf=0.0)
            
            return feature_vector
            
        except Exception as e:
            print(f"⚠️  Feature extraction error: {e}")
            return None
    
    def extract_voice_profile(self, audio_path):
        """
        ✅ 3.0 고도화: Voice ID (음색 지문 추출)
        아기의 고유한 목소리 특성(기본 주파수 F0 및 MFCC 평균)을 추출하여 
        다둥이/조리원 환경에서 '어떤 아기인지' 식별하는 기반 데이터로 사용합니다.
        """
        try:
            y, sr = librosa.load(audio_path, sr=22050, duration=3.0)
            if len(y) == 0:
                return None
            
            # 1. 기본 주파수 (F0 - Pitch) 추출 (librosa.yin 사용)
            # 아기 울음소리는 보통 300Hz ~ 600Hz 사이의 높은 피치를 가짐
            f0 = librosa.yin(y, fmin=200, fmax=800)
            f0 = f0[f0 > 0] # 0인 부분 제외
            avg_pitch = float(np.mean(f0)) if len(f0) > 0 else 0.0
            
            # 2. 음색 특성 (MFCC) 추출
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            avg_mfcc = np.mean(mfcc, axis=1).tolist()
            
            # 3. 목소리 서명 생성
            voice_signature = {
                "pitch_hz": round(avg_pitch, 2),
                "timbre_features": [round(float(x), 4) for x in avg_mfcc[:5]] # 상위 5개 특성만
            }
            return voice_signature
        except Exception as e:
            print(f"⚠️ Voice profile extraction failed: {e}")
            return None

    def predict_with_confidence(self, audio_path, bias=None):
        """
        오디오 파일 분석 및 예측 (개인화 바이어스 적용 추가)
        
        Parameters:
        -----------
        audio_path : str
            오디오 파일 경로
        bias : dict, optional
            카테고리별 피드백 통계 { 'tired': 3, 'hungry': 1 }
            
        Returns:
        --------
        dict : 분석 결과
        """
        if not self.detector:
            return {
                'prediction': 'error',
                'confidence': 0.0,
                'severity': 'Unknown',
                'error': 'Model not loaded'
            }
        
        # 특징 추출
        features = self.extract_features(audio_path)
        
        if features is None:
            return {
                'prediction': 'error',
                'confidence': 0.0,
                'severity': 'Unknown',
                'error': 'Feature extraction failed'
            }
        
        features = features.reshape(1, -1)
        
        # Phase 1: Cry Detection
        features_scaled_phase1 = self.scaler_phase1.transform(features)
        cry_proba = self.detector.predict_proba(features_scaled_phase1)[0]
        is_cry = self.detector.predict(features_scaled_phase1)[0]
        
        # ⭐ 방어 코드: cry_proba 처리
        if len(cry_proba) == 1:
            cry_confidence = float(cry_proba[0])
            not_cry_confidence = 1.0 - cry_confidence
            probabilities_dict = {
                'cry': cry_confidence if is_cry == 'cry' else not_cry_confidence,
                'not_cry': not_cry_confidence if is_cry == 'cry' else cry_confidence
            }
        else:
            classes = self.detector.classes_
            cry_idx = np.where(classes == 'cry')[0]
            not_cry_idx = np.where(classes == 'not_cry')[0]
            cry_confidence = float(cry_proba[cry_idx[0]]) if len(cry_idx) > 0 else float(cry_proba[1])
            not_cry_confidence = float(cry_proba[not_cry_idx[0]]) if len(not_cry_idx) > 0 else float(cry_proba[0])
            probabilities_dict = {'cry': cry_confidence, 'not_cry': not_cry_confidence}
        
        if is_cry == 'not_cry':
            return {
                'prediction': 'not_cry',
                'confidence': not_cry_confidence,
                'severity': 'None',
                'probabilities': probabilities_dict,
                'stage': 'phase1'
            }
        
        # Stage 1 & 2: 울음 분석
        final_prediction = 'discomfort'
        final_confidence = 0.5
        final_stage = 'default'
        
        # 모든 카테고리에 대한 확률 수집 (바이어스 적용을 위해)
        all_probs = {}
        
        # Stage 1: Pain Detection
        features_scaled_stage1 = self.scaler_stage1.transform(features)
        pain_proba_stage1_raw = self.stage1.predict_proba(features_scaled_stage1)[0]
        
        try:
            pain_idx = list(self.stage1.classes_).index('belly_pain')
            pain_proba = float(pain_proba_stage1_raw[pain_idx])
        except:
            pain_proba = float(pain_proba_stage1_raw[-1])
            
        all_probs['belly_pain'] = pain_proba
        
        # Stage 2: Non-pain
        if self.stage2_nonpain:
            features_scaled_stage2 = self.scaler_stage2.transform(features)
            stage2_probs_raw = self.stage2_nonpain.predict_proba(features_scaled_stage2)[0]
            for i, cls in enumerate(self.stage2_nonpain.classes_):
                all_probs[cls] = float(stage2_probs_raw[i])
        
        # ✅ 개인화 바이어스 적용 (1단계 기술 고도화)
        if bias:
            print(f"🧬 [Personalization] Applying bias: {bias}")
            for cat, count in bias.items():
                if cat in all_probs:
                    # 피드백 1회당 0.05 가산 (최대 0.2)
                    bonus = min(0.2, count * 0.05)
                    all_probs[cat] += bonus
                    print(f"   + Added {bonus:.2f} bonus to '{cat}'")
            
            # 합계가 1이 넘을 수 있으므로 정규화 (선택적)
            # total = sum(all_probs.values())
            # all_probs = {k: v/total for k, v in all_probs.items()}

        # 가중치 적용 후 가장 높은 확률 찾기
        best_cat = max(all_probs, key=all_probs.get)
        final_prediction = best_cat
        final_confidence = all_probs[best_cat]
        final_stage = 'personalized_ensemble'

        return {
            'prediction': final_prediction,
            'confidence': min(1.0, float(final_confidence)),
            'severity': self._get_severity(final_confidence),
            'probabilities': all_probs,
            'stage': final_stage,
            'is_personalized': bias is not None
        }
    
    def _get_severity(self, confidence):
        """신뢰도 기반 심각도 계산"""
        confidence_threshold_high = self.thresholds.get('confidence_threshold_high', 0.7)
        confidence_threshold_low = self.thresholds.get('confidence_threshold_low', 0.4)
        
        if confidence >= confidence_threshold_high:
            return 'High'
        elif confidence >= confidence_threshold_low:
            return 'Medium'
        else:
            return 'Low'


# ⭐ 수정: 테스트 코드는 직접 실행할 때만 동작하도록
if __name__ == "__main__":
    print("CryClassifier Test")
    print("=" * 60)
    
    # 모델 로드 테스트
    try:
        classifier = CryClassifier('', sensitivity='balanced')
        classifier.load_model('./models/baby_cry_v15_1')
        print("\n✅ Model load test: SUCCESS")
    except Exception as e:
        print(f"\n❌ Model load test: FAILED - {e}")