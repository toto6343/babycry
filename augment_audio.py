"""
오디오 데이터 증강 스크립트
- 적은 클래스의 데이터를 인위적으로 증가
- 배경 소음, 시간 변환, 피치 변환 등 적용
"""

import librosa
import soundfile as sf
import numpy as np
import os
from pathlib import Path
import random


class AudioAugmenter:
    """오디오 증강 클래스"""
    
    def __init__(self, sr=22050):
        self.sr = sr
    
    def add_noise(self, audio, noise_level=0.005):
        """배경 소음 추가"""
        noise = np.random.randn(len(audio))
        augmented = audio + noise_level * noise
        return augmented
    
    def time_stretch(self, audio, rate=None):
        """시간 늘이기/줄이기"""
        if rate is None:
            rate = random.uniform(0.8, 1.2)
        return librosa.effects.time_stretch(audio, rate=rate)
    
    def pitch_shift(self, audio, n_steps=None):
        """피치 변환"""
        if n_steps is None:
            n_steps = random.randint(-3, 3)
        return librosa.effects.pitch_shift(audio, sr=self.sr, n_steps=n_steps)
    
    def change_volume(self, audio, factor=None):
        """볼륨 조절"""
        if factor is None:
            factor = random.uniform(0.7, 1.3)
        return audio * factor
    
    def time_shift(self, audio, shift_max=None):
        """시간 이동"""
        if shift_max is None:
            shift_max = int(self.sr * 0.5)  # 최대 0.5초
        shift = random.randint(-shift_max, shift_max)
        return np.roll(audio, shift)
    
    def augment_random(self, audio, n_augmentations=1):
        """랜덤 증강 조합"""
        augmentation_methods = [
            lambda x: self.add_noise(x, random.uniform(0.003, 0.01)),
            lambda x: self.time_stretch(x),
            lambda x: self.pitch_shift(x),
            lambda x: self.change_volume(x),
            lambda x: self.time_shift(x),
        ]
        
        augmented_samples = []
        
        for _ in range(n_augmentations):
            aug_audio = audio.copy()
            
            # 2-3개의 증강 기법 랜덤 선택
            n_methods = random.randint(2, 3)
            selected_methods = random.sample(augmentation_methods, n_methods)
            
            for method in selected_methods:
                try:
                    aug_audio = method(aug_audio)
                except Exception as e:
                    print(f"      증강 실패: {e}")
                    continue
            
            # 길이 조정 (원본과 동일하게)
            if len(aug_audio) > len(audio):
                aug_audio = aug_audio[:len(audio)]
            elif len(aug_audio) < len(audio):
                aug_audio = np.pad(aug_audio, (0, len(audio) - len(aug_audio)))
            
            # 정규화
            if np.max(np.abs(aug_audio)) > 0:
                aug_audio = aug_audio / np.max(np.abs(aug_audio)) * 0.9
            
            augmented_samples.append(aug_audio)
        
        return augmented_samples


def augment_dataset(dataset_path, output_path=None, target_samples=200):
    """
    데이터셋 증강
    
    Args:
        dataset_path: 원본 데이터셋 경로
        output_path: 증강된 파일 저장 경로 (None이면 원본 폴더에 저장)
        target_samples: 목표 샘플 수
    """
    
    augmenter = AudioAugmenter()
    
    # 울음 클래스들
    cry_classes = [
        'belly_pain', 'burping', 'discomfort', 'hungry', 
        'tired', 'cold_hot', 'emotional'
    ]
    
    print("=" * 70)
    print("오디오 데이터 증강 시작")
    print("=" * 70)
    
    cry_base_path = Path(dataset_path) / 'cry'
    
    if not cry_base_path.exists():
        print(f"❌ 오류: {cry_base_path} 폴더를 찾을 수 없습니다")
        return
    
    total_original = 0
    total_augmented = 0
    
    for cry_class in cry_classes:
        class_path = cry_base_path / cry_class
        
        if not class_path.exists():
            print(f"⚠️  {cry_class} 폴더를 찾을 수 없음 - 건너뜀")
            continue
        
        # 원본 파일 수집
        audio_files = [f for f in class_path.glob('*') 
                      if f.suffix.lower() in ['.wav', '.mp3', '.ogg', '.flac', '.3gp']]
        
        original_count = len(audio_files)
        total_original += original_count
        
        if original_count >= target_samples:
            print(f"✅ {cry_class:15s}: {original_count:3d}개 (증강 불필요)")
            continue
        
        # 증강 필요 개수 계산
        needed = target_samples - original_count
        augmentations_per_file = max(1, (needed // original_count) + 1)
        
        print(f"\n🔄 {cry_class:15s}: {original_count:3d}개 → {target_samples}개 목표")
        print(f"   파일당 {augmentations_per_file}개 증강 생성 중...")
        
        # 출력 경로 설정
        if output_path:
            output_class_path = Path(output_path) / 'cry' / cry_class
            output_class_path.mkdir(parents=True, exist_ok=True)
        else:
            output_class_path = class_path
        
        augmented_count = 0
        failed_count = 0
        
        for idx, audio_file in enumerate(audio_files, 1):
            try:
                # 진행률 표시
                if idx % 10 == 0 or idx == len(audio_files):
                    print(f"   진행: {idx}/{len(audio_files)} 파일 처리 중...")
                
                # 오디오 로드
                audio, sr = librosa.load(audio_file, sr=22050)
                
                # 증강 생성
                augmented_samples = augmenter.augment_random(
                    audio, n_augmentations=augmentations_per_file
                )
                
                # 저장
                for i, aug_audio in enumerate(augmented_samples):
                    if augmented_count >= needed:
                        break
                    
                    # 파일명 생성
                    base_name = audio_file.stem
                    ext = audio_file.suffix
                    aug_filename = f"{base_name}_aug{i+1}{ext}"
                    aug_path = output_class_path / aug_filename
                    
                    # 저장
                    sf.write(aug_path, aug_audio, sr)
                    augmented_count += 1
                
                if augmented_count >= needed:
                    break
                    
            except Exception as e:
                failed_count += 1
                if failed_count <= 3:  # 처음 3개 오류만 출력
                    print(f"   ⚠️  {audio_file.name} 처리 실패: {str(e)[:50]}")
                continue
        
        total_augmented += augmented_count
        final_count = original_count + augmented_count
        
        print(f"   ✅ {augmented_count}개 증강 완료 → 최종 {final_count}개")
        if failed_count > 0:
            print(f"   ⚠️  {failed_count}개 파일 처리 실패")
    
    print("\n" + "=" * 70)
    print(f"✅ 데이터 증강 완료!")
    print(f"   원본 파일: {total_original}개")
    print(f"   증강 파일: {total_augmented}개")
    print(f"   최종 합계: {total_original + total_augmented}개")
    print("=" * 70)


def augment_specific_class(dataset_path, class_name, n_augmentations=5):
    """
    특정 클래스만 증강
    
    Args:
        dataset_path: 데이터셋 경로
        class_name: 클래스 이름 (예: 'emotional')
        n_augmentations: 파일당 증강 개수
    """
    
    augmenter = AudioAugmenter()
    
    class_path = Path(dataset_path) / 'cry' / class_name
    
    if not class_path.exists():
        print(f"❌ {class_name} 폴더를 찾을 수 없음: {class_path}")
        return
    
    audio_files = [f for f in class_path.glob('*') 
                  if f.suffix.lower() in ['.wav', '.mp3', '.ogg', '.flac', '.3gp']]
    
    original_count = len(audio_files)
    
    print("=" * 70)
    print(f"🔄 '{class_name}' 클래스 증강 시작")
    print("=" * 70)
    print(f"   원본 파일: {original_count}개")
    print(f"   파일당 증강: {n_augmentations}개")
    print(f"   목표 파일: {original_count * (n_augmentations + 1)}개")
    print()
    
    augmented_count = 0
    failed_count = 0
    
    for idx, audio_file in enumerate(audio_files, 1):
        try:
            if idx % 5 == 0 or idx == len(audio_files):
                print(f"   진행: {idx}/{len(audio_files)} 파일 처리 중...")
            
            audio, sr = librosa.load(audio_file, sr=22050)
            
            augmented_samples = augmenter.augment_random(audio, n_augmentations)
            
            for i, aug_audio in enumerate(augmented_samples):
                base_name = audio_file.stem
                ext = audio_file.suffix
                aug_filename = f"{base_name}_aug{i+1}{ext}"
                aug_path = class_path / aug_filename
                
                sf.write(aug_path, aug_audio, sr)
                augmented_count += 1
            
        except Exception as e:
            failed_count += 1
            if failed_count <= 3:
                print(f"   ⚠️  {audio_file.name} 실패: {str(e)[:50]}")
            continue
    
    final_count = original_count + augmented_count
    
    print()
    print("=" * 70)
    print(f"✅ 증강 완료!")
    print(f"   원본 파일: {original_count}개")
    print(f"   증강 파일: {augmented_count}개")
    print(f"   최종 합계: {final_count}개")
    if failed_count > 0:
        print(f"   ⚠️  실패: {failed_count}개")
    print("=" * 70)


def show_current_distribution(dataset_path):
    """현재 데이터 분포 확인"""
    cry_classes = [
        'belly_pain', 'burping', 'discomfort', 'hungry', 
        'tired', 'cold_hot', 'emotional'
    ]
    
    print("\n" + "=" * 70)
    print("📊 현재 데이터 분포")
    print("=" * 70)
    
    cry_base_path = Path(dataset_path) / 'cry'
    
    if not cry_base_path.exists():
        print(f"❌ {cry_base_path} 폴더를 찾을 수 없습니다")
        return
    
    total = 0
    for cry_class in cry_classes:
        class_path = cry_base_path / cry_class
        if class_path.exists():
            audio_files = [f for f in class_path.glob('*') 
                          if f.suffix.lower() in ['.wav', '.mp3', '.ogg', '.flac', '.3gp']]
            count = len(audio_files)
            total += count
            status = "✅" if count >= 200 else "⚠️ "
            print(f"{status} {cry_class:15s}: {count:3d}개")
    
    print("-" * 70)
    print(f"   {'합계':15s}: {total:3d}개")
    print("=" * 70)


# ============================================================
# 실행
# ============================================================

if __name__ == "__main__":
    # 데이터셋 경로 (실제 경로로 수정하세요)
    dataset_path = r'C:\Users\yongb\OneDrive\바탕 화면\babycry\Dataset'
    
    print("\n" + "=" * 70)
    print("🎵 오디오 데이터 증강 도구")
    print("=" * 70)
    
    # 현재 분포 확인
    show_current_distribution(dataset_path)
    
    print("\n선택하세요:")
    print("  1. 전체 클래스 균형 맞추기 (각 200개로)")
    print("  2. emotional 클래스만 집중 증강 (5배)")
    print("  3. 특정 클래스 사용자 정의 증강")
    print("  4. 현재 분포만 확인")
    
    choice = input("\n👉 선택 (1-4): ").strip()
    
    if choice == "1":
        print("\n" + "=" * 70)
        print("전체 데이터셋 증강 시작...")
        print("=" * 70)
        augment_dataset(dataset_path, target_samples=200)
        
    elif choice == "2":
        print("\n" + "=" * 70)
        print("emotional 클래스 집중 증강...")
        print("=" * 70)
        augment_specific_class(dataset_path, 'emotional', n_augmentations=5)
        
    elif choice == "3":
        class_name = input("\n클래스 이름 입력: ").strip()
        try:
            n_aug = int(input("파일당 증강 개수 입력: ").strip())
            augment_specific_class(dataset_path, class_name, n_augmentations=n_aug)
        except ValueError:
            print("❌ 숫자를 입력해주세요")
    
    elif choice == "4":
        print("\n분포 확인 완료!")
        
    else:
        print("\n❌ 잘못된 선택입니다")
    
    print("\n" + "=" * 70)
    print("💡 다음 단계: 모델 재학습")
    print("   python -m backend.models.classifier")
    print("=" * 70)