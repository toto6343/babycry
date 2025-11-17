from flask import Blueprint, request, jsonify
from backend.models.classifier import CryClassifier
from pathlib import Path
import os

api_bp = Blueprint('api', __name__)

# Test route
@api_bp.route('/test', methods=['GET'])
def test():
    return jsonify({"message": "API routes are working"})

# Main upload route
@api_bp.route('/upload', methods=['POST'])
def upload_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file uploaded'}), 400
        
    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        # Initialize classifier
        project_root = Path(__file__).resolve().parents[2]
        
        # ✅ 올바른 모델 경로
        model_path = project_root / 'backend' / 'models' / 'baby_cry_model.pkl'
        
        # 경로 확인 (디버깅용)
        print(f"모델 경로: {model_path}")
        print(f"모델 존재 여부: {model_path.exists()}")
        
        if not model_path.exists():
            return jsonify({'error': f'Model file not found at {model_path}'}), 500
        
        classifier = CryClassifier(str(project_root / 'Dataset'))
        classifier.load_model(str(model_path))
        
        # 모델 정보 확인 (디버깅용)
        print(f"모델이 기대하는 특징 개수: {classifier.model.n_features_in_}")

        # Save and process the file
        upload_dir = project_root / 'backend' / 'uploads'
        os.makedirs(upload_dir, exist_ok=True)
        file_path = upload_dir / file.filename
        file.save(str(file_path))

        # Make prediction using the correct method
        prediction = classifier.predict(str(file_path))
        
        return jsonify({
            'success': True,
            'isCrying': prediction != 'not_cry',
            'reason': prediction if prediction != 'not_cry' else None
        })

    except Exception as e:
        import traceback
        print(f"Error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': str(e), 'success': False}), 500