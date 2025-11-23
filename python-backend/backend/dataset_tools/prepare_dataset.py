import os
import pandas as pd
import numpy as np
from backend.utils.audio import extract_features  # 기존 오디오 특징 추출 함수 사용

def prepare_dataset(data_csv_path, cry_audio_path, not_cry_audio_path):
    """
    cry / not_cry 폴더의 오디오 파일을 읽어서
    모델이 학습했던 feature 형태(17개)에 맞춰 데이터셋을 생성합니다.
    """

    # CSV 파일 불러오기 (데이터 레이블 참조용)
    data = pd.read_csv(data_csv_path)

    features = []
    labels = []

    # --- 1. 아기 울음 데이터 처리 ---
    for cause in os.listdir(cry_audio_path):
        cause_path = os.path.join(cry_audio_path, cause)
        if os.path.isdir(cause_path):
            for audio_file in os.listdir(cause_path):
                if audio_file.endswith('.wav'):
                    audio_path = os.path.join(cause_path, audio_file)
                    try:
                        feature_vector = extract_features(audio_path)
                        features.append(feature_vector)
                        labels.append(cause)
                    except Exception as e:
                        print(f"[경고] {audio_file} 처리 중 오류 발생: {e}")

    # --- 2. 울지 않는 데이터 처리 ---
    for audio_file in os.listdir(not_cry_audio_path):
        if audio_file.endswith('.wav'):
            audio_path = os.path.join(not_cry_audio_path, audio_file)
            try:
                feature_vector = extract_features(audio_path)
                features.append(feature_vector)
                labels.append('not_cry')
            except Exception as e:
                print(f"[경고] {audio_file} 처리 중 오류 발생: {e}")

    # --- 3. 데이터프레임 생성 및 저장 ---
    if len(features) == 0:
        print("⚠️ No features extracted. Check your Dataset and paths.")
        return

    features_df = pd.DataFrame(features)
    features_df['label'] = labels

    # 기존 data.csv와 동일한 폴더에 저장
    prepared_data_path = os.path.join(os.path.dirname(data_csv_path), 'prepared_dataset.csv')
    features_df.to_csv(prepared_data_path, index=False)

    print(f"✅ 데이터셋 준비 완료: {prepared_data_path} ({len(features_df)} samples)")

if __name__ == "__main__":
    prepare_dataset(
        data_csv_path='Dataset/data.csv',
        cry_audio_path='Dataset/cry',
        not_cry_audio_path='Dataset/not_cry'
    )
