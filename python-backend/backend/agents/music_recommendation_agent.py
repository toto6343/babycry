# backend/agents/music_recommendation_agent.py
"""
음악 추천 에이전트
울음 유형별 최적 음악 추천 및 음악 치료 팁 제공
"""

from typing import Dict, List, Optional
from pathlib import Path
import random


class MusicRecommendationAgent:
    """
    울음 유형별 음악 추천 에이전트
    로컬 음악 파일 기반 추천
    """
    
    def __init__(self, music_base_dir: Optional[str] = None):
        """
        Parameters:
        -----------
        music_base_dir : str, optional
            음악 파일 기본 디렉토리 (기본값: backend/music_local)
        """
        if music_base_dir:
            self.base_dir = Path(music_base_dir)
        else:
            # backend/agents/music_recommendation_agent.py 기준
            self.base_dir = Path(__file__).parents[1] / "music_local"
        
        print(f"🎵 [MusicRecommendationAgent] Initializing...")
        print(f"   Music directory: {self.base_dir}")
        
        # 울음 유형별 음악 디렉토리
        self.cry_music_map = {
            'emotional': self.base_dir / 'emotional',
            'tired': self.base_dir / 'tired',
        }
        
        # 지원하는 오디오 확장자
        self.supported_exts = {'.mp3', '.wav', '.ogg', '.flac', '.m4a'}
        
        # 디렉토리 생성
        for folder in self.cry_music_map.values():
            folder.mkdir(parents=True, exist_ok=True)
        
        print(f"✅ [MusicRecommendationAgent] Ready")
    
    async def recommend(self, cry_type: str, context: Optional[Dict] = None) -> Dict:
        """
        울음 유형에 따른 음악 추천
        
        Parameters:
        -----------
        cry_type : str
            울음 유형
        context : dict, optional
            추가 컨텍스트 (예: 시간대, 이전 재생 기록)
        
        Returns:
        --------
        dict : {
            'title': str,           # 음악 제목
            'file_path': str,       # 파일 경로
            'duration': int,        # 길이 (초)
            'description': str,     # 설명
            'therapy_benefit': str  # 음악 치료 효과
        }
        """
        try:
            print(f"\n🎵 [Music] Recommending for: {cry_type}")
            
            # 음악 재생이 필요한 울음 유형인지 확인
            if cry_type not in self.cry_music_map:
                print(f"   → No music recommendation for cry_type: {cry_type}")
                return {
                    'title': '음악 추천 없음',
                    'file_path': None,
                    'duration': 0,
                    'description': f'{cry_type} 유형에는 음악 추천이 제공되지 않습니다.',
                    'therapy_benefit': ''
                }
            
            # 음악 파일 찾기
            folder = self.cry_music_map[cry_type]
            music_files = self._list_audio_files(folder)
            
            if not music_files:
                print(f"   → No music files found in: {folder}")
                return {
                    'title': '음악 파일 없음',
                    'file_path': None,
                    'duration': 0,
                    'description': f'{folder}에 음악 파일을 추가해주세요.',
                    'therapy_benefit': ''
                }
            
            # 랜덤으로 음악 선택 (또는 컨텍스트 기반 선택)
            selected_file = self._select_music(music_files, context)
            
            print(f"✅ [Music] Selected: {selected_file.name}")
            
            return {
                'title': selected_file.stem,
                'file_path': str(selected_file),
                'duration': 180,  # 기본값 3분 (실제로는 파일에서 읽기)
                'description': self._get_music_description(cry_type),
                'therapy_benefit': self._get_therapy_benefit(cry_type)
            }
            
        except Exception as e:
            print(f"❌ [Music] Error: {e}")
            return {
                'title': '추천 실패',
                'file_path': None,
                'duration': 0,
                'description': f'음악 추천 중 오류 발생: {str(e)}',
                'therapy_benefit': ''
            }
    
    def _list_audio_files(self, folder: Path) -> List[Path]:
        """폴더 내 오디오 파일 목록"""
        if not folder.exists():
            return []
        
        files = []
        for p in folder.iterdir():
            if p.is_file() and p.suffix.lower() in self.supported_exts:
                files.append(p)
        return files
    
    def _select_music(self, music_files: List[Path], context: Optional[Dict]) -> Path:
        """음악 선택 (컨텍스트 기반 또는 랜덤)"""
        # TODO: 컨텍스트 기반 선택 로직 추가
        # 예: 시간대별, 이전 재생 기록 기반
        
        return random.choice(music_files)
    
    def _get_music_description(self, cry_type: str) -> str:
        """음악 설명"""
        descriptions = {
            'emotional': '감정을 안정시키는 부드러운 어쿠스틱 자장가',
            'tired': '숙면을 유도하는 편안한 멜로디'
        }
        return descriptions.get(cry_type, '아기를 위한 음악')
    
    def _get_therapy_benefit(self, cry_type: str) -> str:
        """음악 치료 효과"""
        benefits = {
            'emotional': '음악의 규칙적인 리듬과 멜로디가 아기의 감정을 안정시키고 애착 형성에 도움을 줍니다.',
            'tired': '부드러운 자장가는 아기의 뇌파를 진정시켜 깊은 수면을 유도합니다.'
        }
        return benefits.get(cry_type, '')
    
    def get_music_therapy_tips(self, cry_type: str) -> List[str]:
        """음악 치료 팁"""
        tips_map = {
            'emotional': [
                '아기를 안고 음악에 맞춰 부드럽게 흔들어주세요',
                '음량은 대화 소리 정도로 조절하세요 (50-60dB)',
                '10-15분 정도 반복 재생이 효과적입니다'
            ],
            'tired': [
                '조명을 어둡게 하고 음악을 들려주세요',
                '같은 음악을 매일 재생하면 수면 루틴이 형성됩니다',
                '아기가 잠들면 음량을 점점 줄여주세요'
            ]
        }
        return tips_map.get(cry_type, ['음악과 함께 아기를 부드럽게 달래주세요'])
    
    async def create_playlist(self, cry_history: List[str], duration_minutes: int = 30) -> List[Dict]:
        """
        울음 히스토리 기반 플레이리스트 생성
        
        Parameters:
        -----------
        cry_history : List[str]
            최근 울음 유형 기록
        duration_minutes : int
            플레이리스트 총 길이 (분)
        
        Returns:
        --------
        List[Dict] : 플레이리스트 (음악 정보 리스트)
        """
        try:
            print(f"\n🎧 [Playlist] Creating playlist...")
            print(f"   Cry history: {cry_history}")
            print(f"   Target duration: {duration_minutes}분")
            
            playlist = []
            total_duration = 0
            target_duration = duration_minutes * 60
            
            # 가장 빈번한 울음 유형 찾기
            cry_counts = {}
            for cry in cry_history:
                if cry in self.cry_music_map:
                    cry_counts[cry] = cry_counts.get(cry, 0) + 1
            
            if not cry_counts:
                print("   → No music-supported cry types in history")
                return []
            
            # 비율에 따라 음악 추가
            while total_duration < target_duration:
                for cry_type in cry_counts:
                    music = await self.recommend(cry_type)
                    if music['file_path']:
                        playlist.append(music)
                        total_duration += music['duration']
                        
                        if total_duration >= target_duration:
                            break
            
            print(f"✅ [Playlist] Created: {len(playlist)} tracks, {total_duration}초")
            
            return playlist
            
        except Exception as e:
            print(f"❌ [Playlist] Error: {e}")
            return []