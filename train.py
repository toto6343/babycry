import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
import joblib
from ..utils.audio import extract_features

def train_model():
    # Get project root directory
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    dataset_path = os.path.join(project_root, 'Dataset')
    
    # Read the dataset CSV
    csv_path = os.path.join(dataset_path, 'data.csv')
    df = pd.read_csv(csv_path)
    
    print("Extracting features from audio files...")
    
    # Extract features and prepare data
    X = []
    y = []
    skipped = 0
    
    for idx, row in df.iterrows():
        file_path = os.path.join(dataset_path, row['file_path'])
        features = extract_features(file_path)
        
        if features is not None:
            X.append(features)
            y.append(row['label'])
        else:
            skipped += 1
            
        if (idx + 1) % 100 == 0:
            print(f"Processed {idx + 1} files...")
    
    if len(X) == 0:
        print("No features extracted. Check Dataset and data.csv")
        return
        
    X = np.array(X)
    y = np.array(y)
    
    print(f"\nFeature extraction complete:")
    print(f"Successfully processed: {len(X)} files")
    print(f"Skipped: {skipped} files")
    
    # Encode labels
    le = LabelEncoder()
    y = le.fit_transform(y)
    
    # Split dataset
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train model
    print("\nTraining model...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate model
    train_score = model.score(X_train, y_train)
    test_score = model.score(X_test, y_test)
    
    print(f"\nModel performance:")
    print(f"Training accuracy: {train_score:.4f}")
    print(f"Testing accuracy: {test_score:.4f}")
    
    # Save model and label encoder
    model_dir = os.path.join(project_root, 'models')
    os.makedirs(model_dir, exist_ok=True)
    
    joblib.dump(model, os.path.join(model_dir, 'model.joblib'))
    joblib.dump(le, os.path.join(model_dir, 'label_encoder.joblib'))
    
    print(f"\nModel and label encoder saved to {model_dir}")

if __name__ == "__main__":
    train_model()