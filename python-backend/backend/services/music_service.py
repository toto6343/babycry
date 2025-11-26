"""
Local Music Service for Baby Cry

- 문자 알림을 전송할 때
- 울음 원인이 'emotional' 또는 'tired'인 경우에만
  로컬에 저장된 음악 파일을 1곡 재생하는 서비스

지원 울음 원인:
- emotional : 감정적으로 예민/불안정할 때
- tired     : 피곤해서 칭얼거릴 때
"""

import os
import random
import platform
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class LocalMusicService:
    """아기 울음 원인에 따라 로컬 음악 파일을 재생하는 서비스"""

    def __init__(self):
        # 기본 음악 루트 디렉토리 (환경변수로 변경 가능)
        base_dir_env = os.getenv("MUSIC_BASE_DIR", "")
        if base_dir_env:
            self.base_dir = Path(base_dir_env)
        else:
            # backend/services/music_service.py 기준 상위 폴더의 'music_local'
            self.base_dir = Path(__file__).parents[1] / "music_local"

        # 울음 원인별 서브 폴더 매핑
        self.cry_music_dirs = {
            "emotional": self.base_dir / "emotional",
            "tired": self.base_dir / "tired",
        }

        # 지원하는 오디오 확장자
        self.supported_exts = {".mp3", ".wav", ".ogg", ".flac", ".m4a"}

        # 디렉토리 생성
        for cause, folder in self.cry_music_dirs.items():
            folder.mkdir(parents=True, exist_ok=True)

        print("🎵 LocalMusicService initialized")
        print(f"   Base music dir: {self.base_dir}")
        for cause, folder in self.cry_music_dirs.items():
            print(f"   - {cause}: {folder}")

    def play_for_cause(self, cause: str) -> Dict:
        """
        울음 원인(cause)에 따라 로컬 음악 파일을 재생한다.
        emotional, tired 두 경우에만 실제 재생을 시도한다.

        Returns:
            {
              "cause": str,
              "played": bool,
              "file_path": str or None,
              "reason": str  # 왜 재생/실패했는지 설명
            }
        """
        cause = (cause or "").strip().lower()

        if cause not in self.cry_music_dirs:
            reason = f"cause '{cause}' is not supported for local music"
            print(f"🎵 [Music] {reason}")
            return {
                "cause": cause,
                "played": False,
                "file_path": None,
                "reason": reason,
            }

        folder = self.cry_music_dirs[cause]
        files = self._list_audio_files(folder)

        if not files:
            reason = f"no audio files found in {folder}"
            print(f"🎵 [Music] {reason}")
            print(f"   → 이 폴더에 mp3/wav 파일을 넣어주세요.")
            return {
                "cause": cause,
                "played": False,
                "file_path": None,
                "reason": reason,
            }

        # 랜덤으로 한 곡 선택
        target = random.choice(files)
        print(f"🎵 [Music] Playing for cause '{cause}': {target}")

        success, play_reason = self._open_with_default_player(target)

        return {
            "cause": cause,
            "played": success,
            "file_path": str(target),
            "reason": play_reason,
        }

    def _list_audio_files(self, folder: Path) -> List[Path]:
        """폴더 내 지원하는 오디오 파일 목록 리턴"""
        if not folder.exists():
            return []
        files: List[Path] = []
        for p in folder.iterdir():
            if p.is_file() and p.suffix.lower() in self.supported_exts:
                files.append(p)
        return files

    def _open_with_default_player(self, path: Path) -> Tuple[bool, str]:
        """
        운영체제 기본 플레이어로 파일 열기/재생 시도
        - Windows: os.startfile
        - macOS: open
        - Linux: xdg-open
        """
        try:
            system = platform.system().lower()
            if system.startswith("win"):
                # Windows: 기본 프로그램으로 열기
                os.startfile(str(path))  # type: ignore[attr-defined]
            elif system == "darwin":
                # macOS
                subprocess.Popen(["open", str(path)])
            else:
                # Linux / 기타 POSIX
                subprocess.Popen(["xdg-open", str(path)])

            return True, "started with system default player"
        except Exception as e:
            print(f"⚠️ [Music] failed to play file: {e}")
            return False, f"failed to start player: {e}"


# 싱글톤 패턴
_music_service_instance: Optional[LocalMusicService] = None


def get_music_service() -> LocalMusicService:
    """LocalMusicService 싱글톤 인스턴스 반환"""
    global _music_service_instance
    if _music_service_instance is None:
        _music_service_instance = LocalMusicService()
    return _music_service_instance
