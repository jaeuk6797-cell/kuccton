import sys
import librosa
from model import load_model, predict, SAMPLING_RATE

# 사용법: python test_model.py <16kHz로 변환 가능한 음성 파일 경로>
path = sys.argv[1]
wav, _ = librosa.load(path, sr=SAMPLING_RATE, mono=True)

model, fe = load_model()
result = predict(model, fe, wav)
print(result)
