# test_music.py
from backend.services.music_service import get_music_service

def main():
    service = get_music_service()

    # 여기서 tired / emotional 바꿔가며 테스트
    for cause in ["tired", "emotional", "hungry"]:
        print(f"\n=== Testing cause: {cause} ===")
        info = service.play_for_cause(cause)
        print(info)

if __name__ == "__main__":
    main()
