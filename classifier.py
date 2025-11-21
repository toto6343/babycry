"""
CryClassifier - Baby Cry Classification Model Wrapper
V15.1 호환 버전 (improved_v18.py 기반)

이 파일은 backend/models/classifier.py에 저장하세요.
"""

import os
import numpy as np
import librosa
from pathlib import Path
import joblib
import warnings
warnings.filterwarnings('ignore')


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
        오디오 파일에서 특징 추출
        improved_v18.py의 extract_features를 간소화한 버전
        """
        try:
            y, sr = librosa.load(audio_path, duration=duration, sr=22050)
            
            if len(y) == 0:
                return None
            
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
    
    def predict_with_confidence(self, audio_path):
        """
        오디오 파일 분석 및 예측
        
        Returns:
        --------
        dict : {
            'prediction': str,  # 예측 결과
            'confidence': float,  # 신뢰도
            'severity': str,  # 심각도 (High/Medium/Low)
            'probabilities': dict,  # 각 단계별 확률
            'stage': str  # 어느 단계에서 결정되었는지
        }
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
        
        # ⭐ 방어 코드: cry_proba가 예상과 다른 형태일 경우 처리
        if len(cry_proba) == 1:
            # 단일 클래스만 예측된 경우
            cry_confidence = float(cry_proba[0])
            not_cry_confidence = 1.0 - cry_confidence
            probabilities_dict = {
                'cry': cry_confidence if is_cry == 'cry' else not_cry_confidence,
                'not_cry': not_cry_confidence if is_cry == 'cry' else cry_confidence
            }
        else:
            # 정상적인 경우 (2개 클래스)
            # detector의 classes_를 확인하여 올바른 인덱스 사용
            classes = self.detector.classes_
            cry_idx = np.where(classes == 'cry')[0]
            not_cry_idx = np.where(classes == 'not_cry')[0]
            
            cry_confidence = float(cry_proba[cry_idx[0]]) if len(cry_idx) > 0 else float(cry_proba[1])
            not_cry_confidence = float(cry_proba[not_cry_idx[0]]) if len(not_cry_idx) > 0 else float(cry_proba[0])
            
            probabilities_dict = {
                'cry': cry_confidence,
                'not_cry': not_cry_confidence
            }
        
        if is_cry == 'not_cry':
            return {
                'prediction': 'not_cry',
                'confidence': not_cry_confidence,
                'severity': 'None',
                'probabilities': probabilities_dict,
                'stage': 'phase1'
            }
        
        # Stage 1: Primary Pain Detection
        features_scaled_stage1 = self.scaler_stage1.transform(features)
        pain_proba_stage1_raw = self.stage1.predict_proba(features_scaled_stage1)[0]
        
        # ⭐ 방어 코드: pain_proba 처리
        if len(pain_proba_stage1_raw) == 1:
            pain_proba_stage1 = float(pain_proba_stage1_raw[0])
        else:
            # Pain 클래스의 인덱스 찾기
            try:
                pain_idx = list(self.stage1.classes_).index('belly_pain')
                pain_proba_stage1 = float(pain_proba_stage1_raw[pain_idx])
            except (ValueError, AttributeError):
                # 기본값: 마지막 인덱스 사용
                pain_proba_stage1 = float(pain_proba_stage1_raw[-1])
        
        pain_threshold_primary = self.thresholds.get('pain_threshold_primary', 0.5)
        is_pain_stage1 = pain_proba_stage1 >= pain_threshold_primary
        
        probabilities = {
            'cry': cry_confidence,
            'pain_stage1': pain_proba_stage1
        }
        
        if not is_pain_stage1:
            # Non-Pain Classification
            if self.stage2_nonpain:
                features_scaled_stage2 = self.scaler_stage2.transform(features)
                category = self.stage2_nonpain.predict(features_scaled_stage2)[0]
                category_proba = self.stage2_nonpain.predict_proba(features_scaled_stage2)[0]
                confidence = float(np.max(category_proba))
                
                return {
                    'prediction': category,
                    'confidence': confidence,
                    'severity': self._get_severity(confidence),
                    'probabilities': probabilities,
                    'stage': 'stage2_nonpain'
                }
            else:
                return {
                    'prediction': 'needs_attention',
                    'confidence': float(1.0 - pain_proba_stage1),
                    'severity': 'Medium',
                    'probabilities': probabilities,
                    'stage': 'stage1_nonpain'
                }
        
        # Stage 1.5: Cascade Filter
        if self.cascade_filter:
            features_scaled_cascade = self.scaler_cascade.transform(features)
            pain_proba_cascade = self.cascade_filter.predict_proba(features_scaled_cascade)[0, 1]
            
            cascade_thresholds = self.thresholds.get('cascade_thresholds', {
                'high': 0.25, 'balanced': 0.365, 'precise': 0.50
            })
            cascade_threshold = cascade_thresholds.get(self.sensitivity, 0.365)
            is_pain_cascade = pain_proba_cascade >= cascade_threshold
            
            probabilities['pain_cascade'] = float(pain_proba_cascade)
            probabilities['cascade_threshold'] = float(cascade_threshold)
            
            if not is_pain_cascade:
                # Filtered by Cascade -> Re-classify as Non-Pain
                if self.stage2_nonpain:
                    features_scaled_stage2 = self.scaler_stage2.transform(features)
                    category = self.stage2_nonpain.predict(features_scaled_stage2)[0]
                    category_proba = self.stage2_nonpain.predict_proba(features_scaled_stage2)[0]
                    confidence = float(np.max(category_proba))
                    
                    return {
                        'prediction': category,
                        'confidence': confidence,
                        'severity': self._get_severity(confidence),
                        'probabilities': probabilities,
                        'stage': 'cascade_filtered'
                    }
                else:
                    return {
                        'prediction': 'needs_attention',
                        'confidence': float(1.0 - pain_proba_cascade),
                        'severity': 'Medium',
                        'probabilities': probabilities,
                        'stage': 'cascade_filtered'
                    }
            
            # Cascade Confirmed -> Pain
            return {
                'prediction': 'belly_pain',
                'confidence': float(pain_proba_cascade),
                'severity': self._get_severity(pain_proba_cascade),
                'probabilities': probabilities,
                'stage': 'cascade_confirmed'
            }
        
        else:
            # No Cascade -> Use Stage 1 only
            return {
                'prediction': 'belly_pain',
                'confidence': float(pain_proba_stage1),
                'severity': self._get_severity(pain_proba_stage1),
                'probabilities': probabilities,
                'stage': 'stage1_pain'
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