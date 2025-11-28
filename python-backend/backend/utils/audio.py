import os
import librosa
import numpy as np

def load_audio_file(file_path):
    """Load an audio file and return the audio time series and sample rate."""
    try:
        audio, sample_rate = librosa.load(file_path, sr=None)
        return audio, sample_rate
    except Exception as e:
        print(f"Error loading {file_path}: {str(e)}")
        return None, None

def extract_features(audio_path):
    """Extract audio features from file path directly."""
    try:
        # Load audio
        audio, sample_rate = load_audio_file(audio_path)
        if audio is None or sample_rate is None:
            return None
            
        # Extract MFCCs
        mfccs = librosa.feature.mfcc(y=audio, sr=sample_rate, n_mfcc=13)
        mfccs_scaled = np.mean(mfccs.T, axis=0)
        
        # Extract additional features
        spectral_centroids = librosa.feature.spectral_centroid(y=audio, sr=sample_rate)
        spec_centroids_scaled = np.mean(spectral_centroids)
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sample_rate)
        spec_rolloff_scaled = np.mean(spectral_rolloff)
        
        # Zero crossing rate
        zcr = librosa.feature.zero_crossing_rate(audio)
        zcr_scaled = np.mean(zcr)
        
        # RMS Energy
        rms = librosa.feature.rms(y=audio)
        rms_scaled = np.mean(rms)
        
        # Combine all features
        features = np.concatenate([
            mfccs_scaled,
            [spec_centroids_scaled],
            [spec_rolloff_scaled],
            [zcr_scaled],
            [rms_scaled]
        ])
        
        return features
        
    except Exception as e:
        print(f"Failed to extract features for {audio_path}: {str(e)}")
        return None

def process_audio(file_path: str):
    """
    Process audio file and extract features.
    """
    # Load the audio file
    audio, sample_rate = load_audio_file(file_path)
    # Extract features
    features = extract_features(audio, sample_rate)
    return features

def get_audio_files_from_directory(directory):
    """
    Get a list of audio files from a specified directory.
    """
    audio_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(('.wav', '.ogg')):
                audio_files.append(os.path.join(root, file))
    return audio_files

if __name__ == '__main__':
    # Example usage
    audio_file_path = 'path/to/your/audio/file.wav'
    features = extract_features(audio_file_path)
    print(features)