"""
Baby Cry Music Service
아기 울음 원인에 따라 적절한 진정 음악을 제공하는 서비스

지원 음악 소스:
1. YouTube Music API (기본)
2. Spotify API (선택)
3. 로컬 음악 파일 (백업)
"""

import os
import json
import random
from pathlib import Path
from typing import Dict, List, Optional
import requests


class MusicService:
    """아기 진정 음악 제공 서비스"""
    
    def __init__(self):
        # YouTube Music API 설정 (RapidAPI 사용)
        self.youtube_api_key = os.getenv('YOUTUBE_API_KEY', '')
        self.youtube_api_host = "youtube-music-api3.p.rapidapi.com"
        
        # Spotify API 설정 (선택사항)
        self.spotify_client_id = os.getenv('SPOTIFY_CLIENT_ID', '')
        self.spotify_client_secret = os.getenv('SPOTIFY_CLIENT_SECRET', '')
        self.spotify_token = None
        
        # 로컬 음악 디렉토리
        self.music_dir = Path(__file__).parents[1] / 'music'
        self.music_dir.mkdir(exist_ok=True)
        
        # 울음 원인별 음악 매핑
        self.music_mapping = {
            'belly_pain': {
                'keywords': ['baby sleep music', 'white noise', 'calm baby', 'soothing lullaby'],
                'description': '배앓이 진정 음악 (백색소음, 자장가)',
                'local_playlist': 'belly_pain_playlist.json'
            },
            'hungry': {
                'keywords': ['gentle lullaby', 'soft piano baby', 'calm feeding music'],
                'description': '수유 시간 음악 (부드러운 피아노)',
                'local_playlist': 'hungry_playlist.json'
            },
            'tired': {
                'keywords': ['baby sleep music', 'deep sleep lullaby', 'sleep sounds'],
                'description': '수면 유도 음악 (깊은 수면 자장가)',
                'local_playlist': 'tired_playlist.json'
            },
            'burping': {
                'keywords': ['gentle baby music', 'soft instrumental'],
                'description': '트림 시간 음악 (부드러운 연주)',
                'local_playlist': 'burping_playlist.json'
            },
            'cold_hot': {
                'keywords': ['calm baby music', 'nature sounds baby'],
                'description': '온도 불편 진정 음악 (자연의 소리)',
                'local_playlist': 'cold_hot_playlist.json'
            },
            'discomfort': {
                'keywords': ['soothing baby music', 'relaxing lullaby'],
                'description': '불편함 진정 음악 (편안한 자장가)',
                'local_playlist': 'discomfort_playlist.json'
            },
            'emotional': {
                'keywords': ['happy baby music', 'uplifting lullaby', 'gentle melody'],
                'description': '감정 안정 음악 (밝은 멜로디)',
                'local_playlist': 'emotional_playlist.json'
            },
            'default': {
                'keywords': ['baby lullaby', 'white noise', 'calm music'],
                'description': '기본 진정 음악',
                'local_playlist': 'default_playlist.json'
            }
        }
        
        print(f"🎵 MusicService initialized")
        print(f"   Music directory: {self.music_dir}")
        print(f"   YouTube API: {'✓ Configured' if self.youtube_api_key else '✗ Not configured'}")
        print(f"   Spotify API: {'✓ Configured' if self.spotify_client_id else '✗ Not configured'}")
    
    def get_music_for_cry_type(self, cry_type: str, limit: int = 5) -> Dict:
        """
        울음 원인에 따른 음악 추천
        
        Parameters:
        -----------
        cry_type : str
            울음 원인 (belly_pain, hungry, tired 등)
        limit : int
            추천 곡 수
            
        Returns:
        --------
        dict : {
            'cry_type': str,
            'description': str,
            'music_list': [
                {
                    'title': str,
                    'artist': str,
                    'duration': int,
                    'url': str,
                    'thumbnail': str,
                    'source': str  # 'youtube', 'spotify', 'local'
                }
            ],
            'source': str
        }
        """
        
        # 매핑 가져오기 (없으면 default)
        music_config = self.music_mapping.get(cry_type, self.music_mapping['default'])
        
        print(f"🎵 Getting music for cry_type: {cry_type}")
        print(f"   Description: {music_config['description']}")
        
        # 1순위: YouTube Music API
        if self.youtube_api_key:
            try:
                music_list = self._search_youtube_music(music_config['keywords'], limit)
                if music_list:
                    return {
                        'cry_type': cry_type,
                        'description': music_config['description'],
                        'music_list': music_list,
                        'source': 'youtube'
                    }
            except Exception as e:
                print(f"⚠️ YouTube search failed: {e}")
        
        # 2순위: Spotify API
        if self.spotify_client_id:
            try:
                music_list = self._search_spotify(music_config['keywords'], limit)
                if music_list:
                    return {
                        'cry_type': cry_type,
                        'description': music_config['description'],
                        'music_list': music_list,
                        'source': 'spotify'
                    }
            except Exception as e:
                print(f"⚠️ Spotify search failed: {e}")
        
        # 3순위: 로컬 플레이리스트
        music_list = self._get_local_playlist(music_config['local_playlist'])
        
        return {
            'cry_type': cry_type,
            'description': music_config['description'],
            'music_list': music_list[:limit],
            'source': 'local'
        }
    
    def _search_youtube_music(self, keywords: List[str], limit: int) -> List[Dict]:
        """YouTube Music API로 음악 검색"""
        
        if not self.youtube_api_key:
            return []
        
        # 랜덤 키워드 선택
        query = random.choice(keywords)
        
        url = f"https://{self.youtube_api_host}/search"
        
        headers = {
            "X-RapidAPI-Key": self.youtube_api_key,
            "X-RapidAPI-Host": self.youtube_api_host
        }
        
        params = {
            "query": query,
            "type": "song",
            "limit": limit
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            music_list = []
            for item in data.get('result', [])[:limit]:
                music_list.append({
                    'title': item.get('name', 'Unknown'),
                    'artist': item.get('artist', {}).get('name', 'Unknown'),
                    'duration': item.get('duration', 0),
                    'url': f"https://music.youtube.com/watch?v={item.get('videoId', '')}",
                    'thumbnail': item.get('thumbnails', [{}])[0].get('url', ''),
                    'source': 'youtube',
                    'video_id': item.get('videoId', '')
                })
            
            print(f"✅ Found {len(music_list)} songs from YouTube Music")
            return music_list
            
        except Exception as e:
            print(f"⚠️ YouTube Music API error: {e}")
            return []
    
    def _search_spotify(self, keywords: List[str], limit: int) -> List[Dict]:
        """Spotify API로 음악 검색"""
        
        if not self.spotify_client_id or not self.spotify_client_secret:
            return []
        
        # Access Token 가져오기
        if not self.spotify_token:
            self.spotify_token = self._get_spotify_token()
        
        if not self.spotify_token:
            return []
        
        # 랜덤 키워드 선택
        query = random.choice(keywords)
        
        url = "https://api.spotify.com/v1/search"
        
        headers = {
            "Authorization": f"Bearer {self.spotify_token}"
        }
        
        params = {
            "q": query,
            "type": "track",
            "limit": limit
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            music_list = []
            for item in data.get('tracks', {}).get('items', [])[:limit]:
                music_list.append({
                    'title': item.get('name', 'Unknown'),
                    'artist': ', '.join([artist['name'] for artist in item.get('artists', [])]),
                    'duration': item.get('duration_ms', 0) // 1000,
                    'url': item.get('external_urls', {}).get('spotify', ''),
                    'thumbnail': item.get('album', {}).get('images', [{}])[0].get('url', ''),
                    'source': 'spotify',
                    'spotify_id': item.get('id', '')
                })
            
            print(f"✅ Found {len(music_list)} songs from Spotify")
            return music_list
            
        except Exception as e:
            print(f"⚠️ Spotify API error: {e}")
            return []
    
    def _get_spotify_token(self) -> Optional[str]:
        """Spotify Access Token 발급"""
        
        url = "https://accounts.spotify.com/api/token"
        
        data = {
            "grant_type": "client_credentials",
            "client_id": self.spotify_client_id,
            "client_secret": self.spotify_client_secret
        }
        
        try:
            response = requests.post(url, data=data, timeout=10)
            response.raise_for_status()
            
            token_data = response.json()
            return token_data.get('access_token')
            
        except Exception as e:
            print(f"⚠️ Failed to get Spotify token: {e}")
            return None
    
    def _get_local_playlist(self, playlist_filename: str) -> List[Dict]:
        """로컬 플레이리스트 로드 (백업용)"""
        
        playlist_path = self.music_dir / playlist_filename
        
        # 기본 플레이리스트가 없으면 생성
        if not playlist_path.exists():
            default_playlist = self._create_default_playlist(playlist_filename)
            with open(playlist_path, 'w', encoding='utf-8') as f:
                json.dump(default_playlist, f, ensure_ascii=False, indent=2)
        
        try:
            with open(playlist_path, 'r', encoding='utf-8') as f:
                playlist = json.load(f)
                print(f"✅ Loaded local playlist: {playlist_filename}")
                return playlist
        except Exception as e:
            print(f"⚠️ Failed to load local playlist: {e}")
            return []
    
    def _create_default_playlist(self, playlist_filename: str) -> List[Dict]:
        """기본 플레이리스트 생성"""
        
        # 울음 원인별 기본 음악 (YouTube 링크)
        default_playlists = {
            'belly_pain_playlist.json': [
                {
                    'title': 'White Noise for Baby Sleep',
                    'artist': 'Baby Sleep Music',
                    'duration': 3600,
                    'url': 'https://www.youtube.com/watch?v=eKFTSSKCzWA',
                    'thumbnail': '',
                    'source': 'local'
                },
                {
                    'title': 'Gentle Baby Lullaby',
                    'artist': 'Lullaby Music',
                    'duration': 2700,
                    'url': 'https://www.youtube.com/watch?v=6Dakd7EIgCE',
                    'thumbnail': '',
                    'source': 'local'
                }
            ],
            'tired_playlist.json': [
                {
                    'title': 'Deep Sleep Music for Babies',
                    'artist': 'Sleep Sounds',
                    'duration': 3600,
                    'url': 'https://www.youtube.com/watch?v=nDq6TstdEi8',
                    'thumbnail': '',
                    'source': 'local'
                }
            ],
            'default_playlist.json': [
                {
                    'title': 'Brahms Lullaby',
                    'artist': 'Classical Baby',
                    'duration': 180,
                    'url': 'https://www.youtube.com/watch?v=4NuEqH7pmNo',
                    'thumbnail': '',
                    'source': 'local'
                }
            ]
        }
        
        return default_playlists.get(playlist_filename, default_playlists['default_playlist.json'])
    
    def create_custom_playlist(self, cry_type: str, music_list: List[Dict]) -> bool:
        """커스텀 플레이리스트 저장"""
        
        music_config = self.music_mapping.get(cry_type, self.music_mapping['default'])
        playlist_path = self.music_dir / music_config['local_playlist']
        
        try:
            with open(playlist_path, 'w', encoding='utf-8') as f:
                json.dump(music_list, f, ensure_ascii=False, indent=2)
            
            print(f"✅ Custom playlist saved: {playlist_path}")
            return True
            
        except Exception as e:
            print(f"⚠️ Failed to save custom playlist: {e}")
            return False


# 싱글톤
_music_service_instance = None

def get_music_service():
    """MusicService 싱글톤 인스턴스 반환"""
    global _music_service_instance
    if _music_service_instance is None:
        _music_service_instance = MusicService()
    return _music_service_instance