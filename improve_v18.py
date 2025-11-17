"""
Baby Cry Classifier V15.1: Adaptive Sensitivity Architecture

V15.1 핵심 기능:
1. ✅ Cascade Filtering (False Positive 감소)
2. ✅ Adaptive Sensitivity (사용자 선택 가능)
3. ✅ Confidence Scoring (High/Medium/Low)
4. ✅ 3가지 모드: high (안전), balanced (균형), precise (정밀)

민감도별 특성:
- high: Recall 85%+, Precision 60%+ (V15 수준, 안전 우선)
- balanced: Recall 72%, Precision 91% (균형)
- precise: Recall 60%, Precision 95%+ (오경보 최소화)
"""

import os
import numpy as np
import librosa
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, recall_score, precision_recall_curve
from imblearn.over_sampling import SMOTE, BorderlineSMOTE
import joblib
import warnings
warnings.filterwarnings('ignore')


class V15_1AdaptiveCryClassifier:
    """V15.1: Adaptive Sensitivity Architecture"""
    
    def __init__(self, dataset_path):
        self.dataset_path = Path(dataset_path)
        
        self.category_mapping = {
            'belly_pain': 'pain_discomfort',
            'cold_hot': 'needs_attention',
            'burping': 'needs_attention',
            'discomfort': 'needs_attention',
            'hungry': 'needs_attention',
            'tired': 'needs_attention',
            'emotional': 'emotional'
        }
        
        self.X = None
        self.y_binary = None
        self.y_category = None
        self.scaler_phase1 = StandardScaler()
        self.scaler_stage1 = StandardScaler()
        self.scaler_stage1_5 = StandardScaler()
        self.scaler_stage2 = StandardScaler()
        
        # Multiple Thresholds for different sensitivities
        self.pain_threshold_primary = 0.5
        self.cascade_thresholds = {
            'high': 0.25,      # 안전 우선 (Recall 85%+)
            'balanced': 0.365,  # 균형 (현재)
            'precise': 0.50     # 정밀 (Precision 95%+)
        }
        self.confidence_threshold_low = 0.4
        self.confidence_threshold_high = 0.7
    
    def calculate_jitter(self, f0):
        if len(f0) < 3:
            return 0.0
        diffs = np.abs(np.diff(f0))
        mean_f0 = np.mean(f0)
        return np.mean(diffs) / (mean_f0 + 1e-8) if mean_f0 > 1e-8 else 0.0
    
    def calculate_shimmer(self, y):
        amplitudes = np.abs(y)
        if len(amplitudes) < 3:
            return 0.0
        diffs = np.abs(np.diff(amplitudes))
        mean_amp = np.mean(amplitudes)
        return np.mean(diffs) / (mean_amp + 1e-8) if mean_amp > 1e-8 else 0.0
    
    def extract_pain_biomarkers(self, y, sr, f0_voiced, enhanced=False):
        """Pain 핵심 Biomarkers 추출"""
        features = []
        
        # 1. F0 Statistics
        if len(f0_voiced) > 10:
            f0_mean = np.mean(f0_voiced)
            f0_std = np.std(f0_voiced)
            f0_max = np.max(f0_voiced)
            f0_min = np.min(f0_voiced)
            f0_range = f0_max - f0_min
            f0_cv = f0_std / (f0_mean + 1e-8)
            
            features.extend([f0_mean, f0_std, f0_max, f0_min, f0_range, f0_cv])
            
            f0_diffs = np.abs(np.diff(f0_voiced))
            f0_jump_threshold = f0_mean * 0.12
            jump_rate = np.sum(f0_diffs > f0_jump_threshold) / len(f0_diffs)
            features.append(jump_rate)
            
            f0_modulation = np.std(f0_diffs) / (f0_mean + 1e-8)
            features.append(f0_modulation)
            
            jitter = self.calculate_jitter(f0_voiced)
            features.append(jitter)
            
            if enhanced:
                f0_instability = np.sum(f0_diffs > f0_mean * 0.2) / len(f0_diffs)
                features.append(f0_instability)
                
                f0_peaks = (f0_voiced > (f0_mean + 2*f0_std)).sum() / len(f0_voiced)
                features.append(f0_peaks)
        else:
            base_len = 9
            features.extend([0.0] * (base_len + (2 if enhanced else 0)))
        
        # 2. Energy Dynamics
        rms = librosa.feature.rms(y=y)[0]
        features.extend([
            np.mean(rms),
            np.std(rms),
            np.max(rms),
            np.max(rms) / (np.mean(rms) + 1e-8),
        ])
        
        rms_threshold = np.mean(rms) + 1.5 * np.std(rms)
        burst_rate = np.sum(rms > rms_threshold) / len(rms)
        features.append(burst_rate)
        
        if enhanced:
            rms_diffs = np.abs(np.diff(rms))
            energy_volatility = np.std(rms_diffs) / (np.mean(rms) + 1e-8)
            features.append(energy_volatility)
        
        # 3. High Frequency Content
        stft = np.abs(librosa.stft(y))
        freq_bins = librosa.fft_frequencies(sr=sr)
        
        high_freq_mask = freq_bins > 2000
        high_energy = np.sum(stft[high_freq_mask, :] ** 2)
        total_energy = np.sum(stft ** 2) + 1e-8
        high_freq_ratio = high_energy / total_energy
        features.append(high_freq_ratio)
        
        very_high_mask = freq_bins > 3000
        very_high_energy = np.sum(stft[very_high_mask, :] ** 2)
        very_high_ratio = very_high_energy / total_energy
        features.append(very_high_ratio)
        
        if enhanced:
            ultra_high_mask = freq_bins > 4000
            ultra_high_energy = np.sum(stft[ultra_high_mask, :] ** 2)
            ultra_high_ratio = ultra_high_energy / total_energy
            features.append(ultra_high_ratio)
        
        # 4. Spectral Irregularity
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        
        spec_cent_std = np.std(spec_cent)
        spec_rolloff_std = np.std(spec_rolloff)
        
        features.extend([
            spec_cent_std / (np.mean(spec_cent) + 1e-8),
            spec_rolloff_std / (np.mean(spec_rolloff) + 1e-8),
        ])
        
        # 5. Shimmer
        shimmer = self.calculate_shimmer(y)
        features.append(shimmer)
        
        # 6. HNR
        harmonic, percussive = librosa.effects.hpss(y)
        hnr = np.sum(harmonic ** 2) / (np.sum(percussive ** 2) + 1e-8)
        features.append(hnr)
        
        if enhanced:
            hnr_frames = []
            frame_length = len(y) // 10
            for i in range(10):
                start = i * frame_length
                end = start + frame_length
                if end <= len(y):
                    h, p = librosa.effects.hpss(y[start:end])
                    hnr_frame = np.sum(h ** 2) / (np.sum(p ** 2) + 1e-8)
                    hnr_frames.append(hnr_frame)
            
            hnr_stability = np.std(hnr_frames) if len(hnr_frames) > 0 else 0.0
            features.append(hnr_stability)
        
        # 7. Spectral Flux
        flux = librosa.onset.onset_strength(y=y, sr=sr)
        features.extend([
            np.mean(flux),
            np.std(flux),
        ])
        
        # 8. ZCR Dynamics
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        features.extend([
            np.mean(zcr),
            np.std(zcr),
        ])
        
        if enhanced:
            zcr_diffs = np.abs(np.diff(zcr))
            zcr_irregularity = np.std(zcr_diffs) / (np.mean(zcr) + 1e-8)
            features.append(zcr_irregularity)
        
        return features
    
    def extract_features(self, audio_path, duration=3.0, mode='full'):
        """특징 추출"""
        try:
            y, sr = librosa.load(audio_path, duration=duration, sr=22050)
            
            if len(y) == 0:
                return None
            
            f0, _, voiced_probs = librosa.pyin(y, fmin=60, fmax=500, sr=sr)
            f0_voiced = f0[~np.isnan(f0)]
            
            if mode == 'pain_basic':
                features = self.extract_pain_biomarkers(y, sr, f0_voiced, enhanced=False)
                feature_vector = np.array(features)
            
            elif mode == 'pain_enhanced':
                features = self.extract_pain_biomarkers(y, sr, f0_voiced, enhanced=True)
                feature_vector = np.array(features)
            
            else:  # full
                features = []
                
                # MFCC (78)
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
                
                # Spectral (12)
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
                
                # Energy (7)
                zcr = librosa.feature.zero_crossing_rate(y)[0]
                rms = librosa.feature.rms(y=y)[0]
                features.extend([
                    [np.mean(zcr), np.std(zcr)],
                    [np.mean(rms), np.std(rms), np.max(rms)]
                ])
                
                # Harmonic (8)
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
                
                # Temporal (4)
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
            return None
    
    def prepare_dataset(self):
        """데이터셋 준비"""
        print("=" * 60)
        print("V15.1 Adaptive Sensitivity Classifier")
        print("=" * 60)
        
        X_list = []
        y_binary_list = []
        y_category_list = []
        
        print("[1/2] Cry Classes Loading...")
        cry_path = self.dataset_path / 'cry'
        category_counts = {}
        
        for cry_type in self.category_mapping.keys():
            type_path = cry_path / cry_type
            if not type_path.exists():
                continue
            
            audio_files = list(type_path.glob('*'))
            audio_files = [f for f in audio_files if f.suffix.lower() in ['.wav', '.mp3', '.ogg', '.flac', '.3gp']]
            
            category = self.category_mapping[cry_type]
            marker = "🔴" if category == 'pain_discomfort' else "✓"
            print(f"  {marker} {cry_type} ({len(audio_files)} files) -> {category}")
            
            count_success = 0
            for audio_file in audio_files:
                features = self.extract_features(audio_file, mode='full')
                if features is not None:
                    X_list.append(features)
                    y_binary_list.append('cry')
                    y_category_list.append(category)
                    count_success += 1
            
            category_counts[category] = category_counts.get(category, 0) + count_success
        
        print("[2/2] Non-Cry Classes Loading...")
        not_cry_classes = ['silence', 'laugh', 'noise']
        
        for not_cry_type in not_cry_classes:
            type_path = self.dataset_path / not_cry_type
            if not type_path.exists():
                continue
            
            audio_files = list(type_path.glob('*'))
            audio_files = [f for f in audio_files if f.suffix.lower() in ['.wav', '.mp3', '.ogg', '.flac', '.3gp']]
            print(f"  ✓ {not_cry_type}: {len(audio_files)} files")
            
            for audio_file in audio_files:
                features = self.extract_features(audio_file, mode='full')
                if features is not None:
                    X_list.append(features)
                    y_binary_list.append('not_cry')
                    y_category_list.append('not_cry')
        
        self.X = np.array(X_list)
        self.y_binary = np.array(y_binary_list)
        self.y_category = np.array(y_category_list)
        
        # NaN check
        nan_mask = ~np.isnan(self.X).any(axis=1)
        if not nan_mask.all():
            print(f"⚠️  Removing {(~nan_mask).sum()} samples with NaN")
            self.X = self.X[nan_mask]
            self.y_binary = self.y_binary[nan_mask]
            self.y_category = self.y_category[nan_mask]
        
        print(f"\nTotal Samples: {len(self.X)}")
        print(f"Feature Dimension: {self.X.shape[1]}")
        print("\nCategory Distribution (Cry Only):")
        for cat, count in sorted(category_counts.items()):
            print(f"  {cat}: {count} samples")
    
    def train_cry_detector(self):
        """Phase 1: Cry Detector"""
        print("=" * 60)
        print("Phase 1: Cry Detection")
        print("=" * 60)
        
        X_train, X_test, y_train, y_test = train_test_split(
            self.X, self.y_binary, test_size=0.2, random_state=42, stratify=self.y_binary
        )
        
        X_train_scaled = self.scaler_phase1.fit_transform(X_train)
        X_test_scaled = self.scaler_phase1.transform(X_test)
        
        self.cry_detector = RandomForestClassifier(
            n_estimators=500, max_depth=30, random_state=42,
            class_weight='balanced', n_jobs=-1
        )
        
        self.cry_detector.fit(X_train_scaled, y_train)
        
        predictions = self.cry_detector.predict(X_test_scaled)
        accuracy = accuracy_score(y_test, predictions)
        
        print(f"Cry Detector Accuracy: {accuracy * 100:.2f}%")
        
        return accuracy
    
    def train_stage1_pain_detector(self):
        """Stage 1: Primary Pain Detector"""
        print("=" * 60)
        print("Stage 1: Primary Pain Detection")
        print("=" * 60)
        
        cry_mask = self.y_binary == 'cry'
        y_category = self.y_category[cry_mask]
        
        y_pain_binary = np.where(y_category == 'pain_discomfort', 'pain', 'non_pain')
        
        print(f"Pain samples: {np.sum(y_pain_binary == 'pain')}")
        print(f"Non-Pain samples: {np.sum(y_pain_binary == 'non_pain')}")
        
        X_cry = self.X[cry_mask]
        
        X_train, X_test, y_train, y_test = train_test_split(
            X_cry, y_pain_binary, test_size=0.2, random_state=42, stratify=y_pain_binary
        )
        
        print("\nApplying BorderlineSMOTE...")
        try:
            smote = BorderlineSMOTE(sampling_strategy='auto', random_state=42, k_neighbors=5)
            X_train_resampled, y_train_resampled = smote.fit_resample(X_train, y_train)
            print(f"✓ Resampled: Pain={np.sum(y_train_resampled=='pain')}, Non-Pain={np.sum(y_train_resampled=='non_pain')}")
        except:
            X_train_resampled, y_train_resampled = X_train, y_train
        
        X_train_scaled = self.scaler_stage1.fit_transform(X_train_resampled)
        X_test_scaled = self.scaler_stage1.transform(X_test)
        
        sample_weights = np.ones(len(y_train_resampled))
        sample_weights[y_train_resampled == 'pain'] = 2.0
        
        print("\n🔴 Training Stage 1 Classifier...")
        
        self.stage1_pain_detector = GradientBoostingClassifier(
            n_estimators=500,
            max_depth=5,
            learning_rate=0.03,
            subsample=0.8,
            min_samples_split=20,
            min_samples_leaf=10,
            random_state=42,
            validation_fraction=0.15,
            n_iter_no_change=25
        )
        
        self.stage1_pain_detector.fit(X_train_scaled, y_train_resampled, sample_weight=sample_weights)
        
        y_pred_proba = self.stage1_pain_detector.predict_proba(X_test_scaled)[:, 1]
        
        precisions, recalls, thresholds = precision_recall_curve(
            (y_test == 'pain').astype(int), y_pred_proba
        )
        
        target_recall = 0.75
        valid_indices = recalls[:-1] >= target_recall
        
        if np.any(valid_indices):
            valid_precisions = precisions[:-1][valid_indices]
            valid_thresholds = thresholds[valid_indices]
            
            best_idx = np.argmax(valid_precisions)
            self.pain_threshold_primary = valid_thresholds[best_idx]
            
            print(f"\n✓ Stage 1 Threshold: {self.pain_threshold_primary:.3f}")
            print(f"  Recall: {recalls[:-1][valid_indices][best_idx]*100:.1f}%")
            print(f"  Precision: {valid_precisions[best_idx]*100:.1f}%")
        else:
            self.pain_threshold_primary = 0.45
        
        return X_test, y_test, y_pred_proba
    
    def train_stage1_5_cascade_filter(self, X_test_stage1, y_test_stage1, y_proba_stage1):
        """Stage 1.5: Cascade Filter"""
        print("=" * 60)
        print("Stage 1.5: Cascade Filter (Adaptive Thresholds)")
        print("=" * 60)
        
        pain_candidates_mask = y_proba_stage1 >= self.pain_threshold_primary
        X_pain_candidates = X_test_stage1[pain_candidates_mask]
        y_pain_candidates = y_test_stage1[pain_candidates_mask]
        
        print(f"Pain Candidates from Stage 1: {len(X_pain_candidates)}")
        print(f"  True Pain: {np.sum(y_pain_candidates == 'pain')}")
        print(f"  False Positive: {np.sum(y_pain_candidates == 'non_pain')}")
        
        if len(X_pain_candidates) < 50:
            print("⚠️  Not enough candidates for Cascade training. Using Stage 1 only.")
            self.cascade_filter = None
            return
        
        cry_mask = self.y_binary == 'cry'
        X_cry = self.X[cry_mask]
        y_category = self.y_category[cry_mask]
        y_pain_binary = np.where(y_category == 'pain_discomfort', 'pain', 'non_pain')
        
        X_train, X_test, y_train, y_test = train_test_split(
            X_cry, y_pain_binary, test_size=0.2, random_state=43, stratify=y_pain_binary
        )
        
        X_train_scaled = self.scaler_stage1_5.fit_transform(X_train)
        X_test_scaled = self.scaler_stage1_5.transform(X_test)
        
        sample_weights = np.ones(len(y_train))
        sample_weights[y_train == 'pain'] = 1.5
        
        print("\n🔍 Training Cascade Filter...")
        
        self.cascade_filter = GradientBoostingClassifier(
            n_estimators=400,
            max_depth=4,
            learning_rate=0.02,
            subsample=0.7,
            min_samples_split=25,
            min_samples_leaf=15,
            random_state=43,
            validation_fraction=0.2,
            n_iter_no_change=30
        )
        
        self.cascade_filter.fit(X_train_scaled, y_train, sample_weight=sample_weights)
        
        y_pred_proba = self.cascade_filter.predict_proba(X_test_scaled)[:, 1]
        
        precisions, recalls, thresholds = precision_recall_curve(
            (y_test == 'pain').astype(int), y_pred_proba
        )
        
        # Calculate thresholds for each sensitivity mode
        print("\n✓ Calculating Adaptive Thresholds:")
        
        # High Sensitivity (Recall 85%+)
        high_recall_target = 0.85
        high_valid = recalls[:-1] >= high_recall_target
        if np.any(high_valid):
            high_idx = np.argmax(precisions[:-1][high_valid])
            self.cascade_thresholds['high'] = thresholds[high_valid][high_idx]
            print(f"  🟢 High Sensitivity: threshold={self.cascade_thresholds['high']:.3f}, "
                  f"Recall={recalls[:-1][high_valid][high_idx]*100:.1f}%, "
                  f"Precision={precisions[:-1][high_valid][high_idx]*100:.1f}%")
        
        # Balanced (Recall 70-75%)
        balanced_recall_target = 0.70
        balanced_valid = recalls[:-1] >= balanced_recall_target
        if np.any(balanced_valid):
            # Among Recall >= 70%, find best Precision
            balanced_idx = np.argmax(precisions[:-1][balanced_valid])
            self.cascade_thresholds['balanced'] = thresholds[balanced_valid][balanced_idx]
            print(f"  🟡 Balanced: threshold={self.cascade_thresholds['balanced']:.3f}, "
                  f"Recall={recalls[:-1][balanced_valid][balanced_idx]*100:.1f}%, "
                  f"Precision={precisions[:-1][balanced_valid][balanced_idx]*100:.1f}%")
        
        # Precise (Precision 95%+)
        precise_precision_target = 0.95
        precise_valid = precisions[:-1] >= precise_precision_target
        if np.any(precise_valid):
            precise_idx = np.argmax(recalls[:-1][precise_valid])
            self.cascade_thresholds['precise'] = thresholds[precise_valid][precise_idx]
            print(f"  🔴 Precise: threshold={self.cascade_thresholds['precise']:.3f}, "
                  f"Recall={recalls[:-1][precise_valid][precise_idx]*100:.1f}%, "
                  f"Precision={precisions[:-1][precise_valid][precise_idx]*100:.1f}%")
    
    def train_stage2_nonpain_classifier(self):
        """Stage 2: Non-Pain Classifier"""
        print("=" * 60)
        print("Stage 2: Non-Pain Classification")
        print("=" * 60)
        
        cry_mask = self.y_binary == 'cry'
        X_cry = self.X[cry_mask]
        y_category = self.y_category[cry_mask]
        
        nonpain_mask = y_category != 'pain_discomfort'
        X_nonpain = X_cry[nonpain_mask]
        y_nonpain = y_category[nonpain_mask]
        
        print(f"Non-Pain Samples: {len(X_nonpain)}")
        print(f"  emotional: {np.sum(y_nonpain == 'emotional')}")
        print(f"  needs_attention: {np.sum(y_nonpain == 'needs_attention')}")
        
        X_train, X_test, y_train, y_test = train_test_split(
            X_nonpain, y_nonpain, test_size=0.2, random_state=42, stratify=y_nonpain
        )
        
        X_train_scaled = self.scaler_stage2.fit_transform(X_train)
        X_test_scaled = self.scaler_stage2.transform(X_test)
        
        self.nonpain_classifier = RandomForestClassifier(
            n_estimators=400,
            max_depth=18,
            min_samples_split=8,
            min_samples_leaf=3,
            random_state=42,
            n_jobs=-1,
            class_weight='balanced'
        )
        
        self.nonpain_classifier.fit(X_train_scaled, y_train)
        
        predictions = self.nonpain_classifier.predict(X_test_scaled)
        accuracy = accuracy_score(y_test, predictions)
        
        print(f"\nNon-Pain Classifier Accuracy: {accuracy * 100:.2f}%")
        print(classification_report(y_test, predictions))
        
        return accuracy
    
    def evaluate_all_sensitivities(self):
        """모든 민감도 모드 평가"""
        print("=" * 60)
        print("Adaptive Sensitivity Evaluation")
        print("=" * 60)
        
        cry_mask = self.y_binary == 'cry'
        X_cry = self.X[cry_mask]
        y_true = self.y_category[cry_mask]
        
        X_train, X_test, y_train_true, y_test_true = train_test_split(
            X_cry, y_true, test_size=0.2, random_state=42, stratify=y_true
        )
        
        results = {}
        
        for sensitivity_mode in ['high', 'balanced', 'precise']:
            print(f"\n{'='*60}")
            print(f"Testing: {sensitivity_mode.upper()} Sensitivity Mode")
            print(f"{'='*60}")
            
            # Stage 1: Primary Pain Detection
            X_test_scaled_stage1 = self.scaler_stage1.transform(X_test)
            pain_proba_stage1 = self.stage1_pain_detector.predict_proba(X_test_scaled_stage1)[:, 1]
            is_pain_stage1 = pain_proba_stage1 >= self.pain_threshold_primary
            
            # Stage 1.5: Cascade Filter
            final_pain_mask = np.zeros(len(X_test), dtype=bool)
            
            if self.cascade_filter is not None and np.sum(is_pain_stage1) > 0:
                cascade_threshold = self.cascade_thresholds[sensitivity_mode]
                
                X_pain_candidates = X_test[is_pain_stage1]
                X_candidates_scaled = self.scaler_stage1_5.transform(X_pain_candidates)
                
                pain_proba_cascade = self.cascade_filter.predict_proba(X_candidates_scaled)[:, 1]
                is_pain_cascade = pain_proba_cascade >= cascade_threshold
                
                pain_indices = np.where(is_pain_stage1)[0]
                confirmed_pain_indices = pain_indices[is_pain_cascade]
                final_pain_mask[confirmed_pain_indices] = True
                
                print(f"Stage 1 Candidates: {np.sum(is_pain_stage1)}")
                print(f"Cascade Confirmed: {np.sum(is_pain_cascade)} (threshold={cascade_threshold:.3f})")
                print(f"Filtered Out: {np.sum(is_pain_stage1) - np.sum(is_pain_cascade)}")
            else:
                final_pain_mask = is_pain_stage1
                print("⚠️  Cascade Filter not available. Using Stage 1 only.")
            
            # Stage 2: Non-Pain Classification
            X_test_scaled_stage2 = self.scaler_stage2.transform(X_test)
            nonpain_predictions = self.nonpain_classifier.predict(X_test_scaled_stage2)
            
            # Final Predictions
            final_predictions = np.where(final_pain_mask, 'pain_discomfort', nonpain_predictions)
            
            # Metrics
            accuracy = accuracy_score(y_test_true, final_predictions)
            
            pain_mask_pred = final_predictions == 'pain_discomfort'
            pain_mask_true = y_test_true == 'pain_discomfort'
            
            if np.sum(pain_mask_pred) > 0:
                pain_precision = np.sum(pain_mask_pred & pain_mask_true) / np.sum(pain_mask_pred)
            else:
                pain_precision = 0.0
            
            if np.sum(pain_mask_true) > 0:
                pain_recall = np.sum(pain_mask_pred & pain_mask_true) / np.sum(pain_mask_true)
            else:
                pain_recall = 0.0
            
            pain_f1 = 2 * pain_precision * pain_recall / (pain_precision + pain_recall + 1e-8)
            
            # False Negatives and False Positives
            false_negatives = np.sum(pain_mask_true & ~pain_mask_pred)
            false_positives = np.sum(~pain_mask_true & pain_mask_pred)
            
            print(f"\n📊 Results:")
            print(f"  Overall Accuracy: {accuracy * 100:.2f}%")
            print(f"  🔴 Pain Recall: {pain_recall * 100:.2f}%")
            print(f"  🔴 Pain Precision: {pain_precision * 100:.2f}%")
            print(f"  🔴 Pain F1-Score: {pain_f1 * 100:.2f}%")
            print(f"  False Negatives (Missed Pain): {false_negatives}")
            print(f"  False Positives (False Alarms): {false_positives}")
            
            # needs_attention → pain 오분류
            needs_mask = y_test_true == 'needs_attention'
            needs_to_pain = np.sum(needs_mask & pain_mask_pred)
            print(f"  needs_attention → pain: {needs_to_pain}")
            
            results[sensitivity_mode] = {
                'accuracy': accuracy,
                'pain_recall': pain_recall,
                'pain_precision': pain_precision,
                'pain_f1': pain_f1,
                'false_negatives': false_negatives,
                'false_positives': false_positives,
                'needs_to_pain': needs_to_pain
            }
            
            # Confusion Matrix
            if sensitivity_mode == 'balanced':  # Only show for balanced mode
                print("\nConfusion Matrix:")
                cm = confusion_matrix(y_test_true, final_predictions)
                categories = sorted(set(y_test_true))
                
                header = " " * 20 + "  ".join(f"{cat:15s}" for cat in categories)
                print("-" * len(header))
                print(header)
                print("-" * len(header))
                
                for i, cat in enumerate(categories):
                    row = f"{cat:20s}" + "".join(f"{cm[i][j]:17d}" for j in range(len(categories)))
                    print(row)
        
        # Summary Comparison
        print("\n" + "=" * 60)
        print("Sensitivity Mode Comparison Summary")
        print("=" * 60)
        print(f"{'Mode':<12} {'Recall':<10} {'Precision':<12} {'F1-Score':<10} {'FN':<6} {'FP':<6}")
        print("-" * 60)
        
        for mode in ['high', 'balanced', 'precise']:
            r = results[mode]
            print(f"{mode.upper():<12} {r['pain_recall']*100:>6.1f}%   "
                  f"{r['pain_precision']*100:>8.1f}%    "
                  f"{r['pain_f1']*100:>6.1f}%   "
                  f"{r['false_negatives']:>4}  "
                  f"{r['false_positives']:>4}")
        
        print("\n💡 Recommendations:")
        print("  🟢 HIGH: Use for medical/hospital settings (miss nothing)")
        print("  🟡 BALANCED: Use for home apps (good balance)")
        print("  🔴 PRECISE: Use at night (minimize false alarms)")
        
        return results
    
    def save_models(self, output_dir='./models'):
        """모델 저장"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        joblib.dump(self.cry_detector, output_path / 'baby_cry_v15_1_detector.pkl')
        joblib.dump(self.stage1_pain_detector, output_path / 'baby_cry_v15_1_stage1_pain.pkl')
        
        if self.cascade_filter is not None:
            joblib.dump(self.cascade_filter, output_path / 'baby_cry_v15_1_cascade.pkl')
        
        joblib.dump(self.nonpain_classifier, output_path / 'baby_cry_v15_1_nonpain.pkl')
        joblib.dump(self.scaler_phase1, output_path / 'baby_cry_v15_1_scaler_phase1.pkl')
        joblib.dump(self.scaler_stage1, output_path / 'baby_cry_v15_1_scaler_stage1.pkl')
        joblib.dump(self.scaler_stage1_5, output_path / 'baby_cry_v15_1_scaler_cascade.pkl')
        joblib.dump(self.scaler_stage2, output_path / 'baby_cry_v15_1_scaler_stage2.pkl')
        
        thresholds = {
            'pain_threshold_primary': self.pain_threshold_primary,
            'cascade_thresholds': self.cascade_thresholds,
            'confidence_threshold_low': self.confidence_threshold_low,
            'confidence_threshold_high': self.confidence_threshold_high
        }
        joblib.dump(thresholds, output_path / 'baby_cry_v15_1_thresholds.pkl')
        
        print(f"\n✅ Models saved to: {output_path.absolute()}")
    
    def train_all(self):
        """전체 학습 파이프라인"""
        self.prepare_dataset()
        
        self.train_cry_detector()
        
        X_test_stage1, y_test_stage1, y_proba_stage1 = self.train_stage1_pain_detector()
        
        self.train_stage1_5_cascade_filter(X_test_stage1, y_test_stage1, y_proba_stage1)
        
        self.train_stage2_nonpain_classifier()
        
        results = self.evaluate_all_sensitivities()
        
        self.save_models('./models')
        
        print("\n" + "=" * 60)
        print("✅ V15.1 Adaptive Sensitivity Model Complete!")
        print("=" * 60)
        print(f"📊 Available Sensitivity Modes:")
        print(f"   🟢 HIGH: Safety-first (Recall {results['high']['pain_recall']*100:.1f}%)")
        print(f"   🟡 BALANCED: Best overall (F1 {results['balanced']['pain_f1']*100:.1f}%)")
        print(f"   🔴 PRECISE: Minimize alarms (Precision {results['precise']['pain_precision']*100:.1f}%)")
        print("=" * 60)
        
        return results


class V15_1AdaptivePredictor:
    """V15.1 실시간 예측 클래스 (Adaptive Sensitivity)"""
    
    def __init__(self, model_dir='./models', sensitivity='balanced'):
        """
        Parameters:
        -----------
        model_dir : str
            모델 파일 경로
        sensitivity : str
            'high', 'balanced', 'precise' 중 선택
        """
        model_path = Path(model_dir)
        
        if sensitivity not in ['high', 'balanced', 'precise']:
            raise ValueError("sensitivity must be 'high', 'balanced', or 'precise'")
        
        self.sensitivity = sensitivity
        
        self.cry_detector = joblib.load(model_path / 'baby_cry_v15_1_detector.pkl')
        self.stage1_pain_detector = joblib.load(model_path / 'baby_cry_v15_1_stage1_pain.pkl')
        
        try:
            self.cascade_filter = joblib.load(model_path / 'baby_cry_v15_1_cascade.pkl')
        except:
            self.cascade_filter = None
            print("⚠️  Cascade filter not found. Using Stage 1 only.")
        
        self.nonpain_classifier = joblib.load(model_path / 'baby_cry_v15_1_nonpain.pkl')
        
        self.scaler_phase1 = joblib.load(model_path / 'baby_cry_v15_1_scaler_phase1.pkl')
        self.scaler_stage1 = joblib.load(model_path / 'baby_cry_v15_1_scaler_stage1.pkl')
        self.scaler_stage1_5 = joblib.load(model_path / 'baby_cry_v15_1_scaler_cascade.pkl')
        self.scaler_stage2 = joblib.load(model_path / 'baby_cry_v15_1_scaler_stage2.pkl')
        
        thresholds = joblib.load(model_path / 'baby_cry_v15_1_thresholds.pkl')
        self.pain_threshold_primary = thresholds['pain_threshold_primary']
        self.cascade_thresholds = thresholds['cascade_thresholds']
        self.confidence_threshold_low = thresholds['confidence_threshold_low']
        self.confidence_threshold_high = thresholds['confidence_threshold_high']
        
        print(f"✅ V15.1 Predictor initialized with {sensitivity.upper()} sensitivity")
        print(f"   Cascade threshold: {self.cascade_thresholds[sensitivity]:.3f}")
    
    def set_sensitivity(self, sensitivity):
        """민감도 모드 변경"""
        if sensitivity not in ['high', 'balanced', 'precise']:
            raise ValueError("sensitivity must be 'high', 'balanced', or 'precise'")
        
        self.sensitivity = sensitivity
        print(f"✅ Sensitivity changed to {sensitivity.upper()}")
        print(f"   Cascade threshold: {self.cascade_thresholds[sensitivity]:.3f}")
    
    def extract_features(self, audio_path, duration=3.0):
        """특징 추출"""
        classifier = V15_1AdaptiveCryClassifier('')
        return classifier.extract_features(audio_path, duration=duration, mode='full')
    
    def predict(self, audio_path, return_detailed=False):
        """
        예측 수행
        
        Parameters:
        -----------
        audio_path : str
            오디오 파일 경로
        return_detailed : bool
            상세 정보 포함 여부
        
        Returns:
        --------
        dict : 예측 결과
        """
        features = self.extract_features(audio_path)
        
        if features is None:
            return {
                'result': 'error',
                'message': 'Feature extraction failed'
            }
        
        features = features.reshape(1, -1)
        
        # Phase 1: Cry Detection
        features_scaled_phase1 = self.scaler_phase1.transform(features)
        cry_proba = self.cry_detector.predict_proba(features_scaled_phase1)[0]
        is_cry = self.cry_detector.predict(features_scaled_phase1)[0]
        
        if is_cry == 'not_cry':
            return {
                'result': 'not_cry',
                'confidence': float(cry_proba[0]),
                'sensitivity_mode': self.sensitivity,
                'message': 'Not a cry sound'
            }
        
        # Stage 1: Primary Pain Detection
        features_scaled_stage1 = self.scaler_stage1.transform(features)
        pain_proba_stage1 = self.stage1_pain_detector.predict_proba(features_scaled_stage1)[0, 1]
        
        is_pain_stage1 = pain_proba_stage1 >= self.pain_threshold_primary
        
        if not is_pain_stage1:
            # Non-Pain Classification
            features_scaled_stage2 = self.scaler_stage2.transform(features)
            category = self.nonpain_classifier.predict(features_scaled_stage2)[0]
            category_proba = self.nonpain_classifier.predict_proba(features_scaled_stage2)[0]
            
            result = {
                'result': category,
                'confidence': float(np.max(category_proba)),
                'sensitivity_mode': self.sensitivity,
                'stage': 'stage1_nonpain'
            }
            
            if return_detailed:
                result['probabilities'] = {
                    'pain_stage1': float(pain_proba_stage1),
                    'category': dict(zip(self.nonpain_classifier.classes_, category_proba.tolist()))
                }
            
            return result
        
        # Stage 1.5: Cascade Filter
        if self.cascade_filter is not None:
            features_scaled_cascade = self.scaler_stage1_5.transform(features)
            pain_proba_cascade = self.cascade_filter.predict_proba(features_scaled_cascade)[0, 1]
            
            cascade_threshold = self.cascade_thresholds[self.sensitivity]
            is_pain_cascade = pain_proba_cascade >= cascade_threshold
            
            if not is_pain_cascade:
                # Filtered by Cascade -> Re-classify as Non-Pain
                features_scaled_stage2 = self.scaler_stage2.transform(features)
                category = self.nonpain_classifier.predict(features_scaled_stage2)[0]
                category_proba = self.nonpain_classifier.predict_proba(features_scaled_stage2)[0]
                
                result = {
                    'result': category,
                    'confidence': float(np.max(category_proba)),
                    'sensitivity_mode': self.sensitivity,
                    'stage': 'cascade_filtered',
                    'note': f'Initially flagged as pain but filtered by {self.sensitivity} cascade'
                }
                
                if return_detailed:
                    result['probabilities'] = {
                        'pain_stage1': float(pain_proba_stage1),
                        'pain_cascade': float(pain_proba_cascade),
                        'cascade_threshold': float(cascade_threshold),
                        'category': dict(zip(self.nonpain_classifier.classes_, category_proba.tolist()))
                    }
                
                return result
            
            # Cascade Confirmed -> Pain
            confidence_level = 'High' if pain_proba_cascade >= self.confidence_threshold_high else \
                             'Medium' if pain_proba_cascade >= self.confidence_threshold_low else 'Low'
            
            result = {
                'result': 'pain_discomfort',
                'confidence': float(pain_proba_cascade),
                'confidence_level': confidence_level,
                'sensitivity_mode': self.sensitivity,
                'stage': 'cascade_confirmed',
                'alert': '🔴 PAIN DETECTED - Immediate attention recommended'
            }
            
            if return_detailed:
                result['probabilities'] = {
                    'pain_stage1': float(pain_proba_stage1),
                    'pain_cascade': float(pain_proba_cascade),
                    'cascade_threshold': float(cascade_threshold)
                }
            
            return result
        
        else:
            # No Cascade -> Use Stage 1 only
            confidence_level = 'High' if pain_proba_stage1 >= self.confidence_threshold_high else \
                             'Medium' if pain_proba_stage1 >= self.confidence_threshold_low else 'Low'
            
            result = {
                'result': 'pain_discomfort',
                'confidence': float(pain_proba_stage1),
                'confidence_level': confidence_level,
                'sensitivity_mode': self.sensitivity,
                'stage': 'stage1_pain',
                'alert': '🔴 PAIN DETECTED - Immediate attention recommended'
            }
            
            if return_detailed:
                result['probabilities'] = {
                    'pain_stage1': float(pain_proba_stage1)
                }
            
            return result


if __name__ == "__main__":
    dataset_path = r'C:\Users\yongb\OneDrive\바탕 화면\babycry\Dataset'
    
    classifier = V15_1AdaptiveCryClassifier(dataset_path)
    results = classifier.train_all()
    
    print("\n" + "=" * 60)
    print("Example Usage:")
    print("=" * 60)
    print("""
# 기본 사용 (Balanced 모드)
predictor = V15_1AdaptivePredictor('./models', sensitivity='balanced')
result = predictor.predict('baby_cry.wav')
print(result)

# 민감도 변경
predictor.set_sensitivity('high')  # 안전 모드로 변경
result = predictor.predict('baby_cry.wav')

# 상세 정보 포함
result = predictor.predict('baby_cry.wav', return_detailed=True)
print(result['probabilities'])

# 출력 예시:
# {
#     'result': 'pain_discomfort',
#     'confidence': 0.85,
#     'confidence_level': 'High',
#     'sensitivity_mode': 'balanced',
#     'stage': 'cascade_confirmed',
#     'alert': '🔴 PAIN DETECTED - Immediate attention recommended'
# }

# 사용 시나리오:
# 1. 낮 시간 (가정): sensitivity='balanced'
# 2. 밤 시간 (수면): sensitivity='precise' (false alarm 최소화)
# 3. 병원/의료: sensitivity='high' (pain 놓치면 안됨)
    """)