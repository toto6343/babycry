# backend/agents/cry_classification_agent.py
"""
울음 분류 에이전트
CryClassifier 모델을 활용한 6가지 울음 유형 분류
"""

import os
from pathlib import Path
from typing import Dict, Optional
from backend.models.classifier import CryClassifier


class CryClassificationAgent:
    """
    울음 소리 분류 에이전트
    
    울음 유형:
    - hungry: 배고픔
    - tired: 피곤함
    - belly_pain: 복통
    - burping: 트림 필요
    - discomfort: 불편함
    - emotional: 감정적 불안
    """
    
    def __init__(self, model_path: Optional[str] = None, sensitivity: str = 'balanced'):
        """
        Parameters:
        -----------
        model_path : str, optional
            모델 파일 경로 (기본값: 프로젝트 루트의 models/baby_cry_v15_1_detector.pkl)
        sensitivity : str
            민감도 모드 ('high', 'balanced', 'precise')
        """
        if model_path is None:
            # 프로젝트 루트에서 모델 찾기
            project_root = Path(__file__).parents[2]
            model_path = project_root / 'models' / 'baby_cry_v15_1_detector.pkl'
        
        self.model_path = str(model_path)
        self.sensitivity = sensitivity
        
        print(f"🤖 [CryClassificationAgent] Initializing...")
        print(f"   Model: {self.model_path}")
        print(f"   Sensitivity: {sensitivity}")
        
        # 분류기 로드
        self.classifier = CryClassifier('', sensitivity=sensitivity)
        self.classifier.load_model(self.model_path)
        
        print(f"✅ [CryClassificationAgent] Ready")
        
        # 한글 카테고리 매핑
        self.category_kr = {
            'hungry': '배고픔',
            'tired': '피곤함',
            'belly_pain': '복통',
            'burping': '트림 필요',
            'discomfort': '불편함',
            'emotional': '감정적 불안',
            'not_cry': '울음 아님'
        }
    
    async def classify(self, audio_path: str) -> Dict:
        """
        울음 소리 분류 수행
        
        Parameters:
        -----------
        audio_path : str
            오디오 파일 경로
        
        Returns:
        --------
        dict : {
            'cry_type': str,       # 울음 유형
            'confidence': float,   # 신뢰도 (0-1)
            'severity': str,       # 심각도 (High/Medium/Low)
            'category_kr': str,    # 한글 카테고리명
            'features': dict,      # 추가 특징 정보
            'audio_duration': float # 오디오 길이 (초)
        }
        """
        try:
            print(f"\n🔍 [Classification] Analyzing: {audio_path}")
            
            # 모델 예측
            result = self.classifier.predict_with_confidence(audio_path)
            
            cry_type = result['prediction']
            confidence = result['confidence']
            severity = result['severity']
            
            print(f"✅ [Classification] Result: {cry_type} (신뢰도: {confidence:.2%})")
            print(f"   심각도: {severity}")
            print(f"   결정 단계: {result.get('stage', 'unknown')}")
            
            # 오디오 길이 계산
            import librosa
            try:
                y, sr = librosa.load(audio_path, sr=None)
                audio_duration = len(y) / sr
            except Exception:
                audio_duration = 3.0
            
            return {
                'cry_type': cry_type,
                'confidence': confidence,
                'severity': severity,
                'category_kr': self.category_kr.get(cry_type, cry_type),
                'features': {
                    'probabilities': result.get('probabilities', {}),
                    'stage': result.get('stage', 'unknown')
                },
                'audio_duration': audio_duration
            }
            
        except Exception as e:
            print(f"❌ [Classification] Error: {e}")
            return {
                'cry_type': 'error',
                'confidence': 0.0,
                'severity': 'Unknown',
                'category_kr': '분류 실패',
                'features': {'error': str(e)},
                'audio_duration': 0.0
            }
    
    def set_sensitivity(self, sensitivity: str):
        """민감도 변경"""
        self.classifier.set_sensitivity(sensitivity)
        self.sensitivity = sensitivity
        print(f"✅ [CryClassificationAgent] Sensitivity changed to: {sensitivity}")