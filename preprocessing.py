import os
import numpy as np
import librosa

def load_audio_file(file_path):
    audio, sample_rate = librosa.load(file_path, sr=None)
    return audio, sample_rate

def extract_features(audio, sample_rate):
    # Extracting features such as MFCCs, Chroma, Mel, etc.
    mfccs = np.mean(librosa.feature.mfcc(y=audio, sr=sample_rate, n_mfcc=13).T, axis=0)
    chroma = np.mean(librosa.feature.chroma_stft(y=audio, sr=sample_rate).T, axis=0)
    mel = np.mean(librosa.feature.melspectrogram(y=audio, sr=sample_rate).T, axis=0)
    contrast = np.mean(librosa.feature.spectral_contrast(y=audio, sr=sample_rate).T, axis=0)
    tonnetz = np.mean(librosa.feature.tonnetz(y=audio, sr=sample_rate).T, axis=0)

    return np.hstack((mfccs, chroma, mel, contrast, tonnetz))

def preprocess_audio(file_path):
    audio, sample_rate = load_audio_file(file_path)
    features = extract_features(audio, sample_rate)
    return features

def preprocess_dataset(dataset_path):
    features_list = []
    labels_list = []

    for label in os.listdir(dataset_path):
        label_path = os.path.join(dataset_path, label)
        if os.path.isdir(label_path):
            for audio_file in os.listdir(label_path):
                if audio_file.endswith('.wav'):  # Assuming audio files are in .wav format
                    file_path = os.path.join(label_path, audio_file)
                    features = preprocess_audio(file_path)
                    features_list.append(features)
                    labels_list.append(label)

    return np.array(features_list), np.array(labels_list)