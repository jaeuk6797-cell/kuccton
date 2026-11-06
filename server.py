import io
import subprocess

import librosa
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from model import SAMPLING_RATE, load_model, predict

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

model, fe = load_model()


def to_wave(data: bytes):
    # wav 등 librosa가 바로 읽는 포맷이면 그대로, 브라우저 webm이면 ffmpeg로 변환
    try:
        wav, _ = librosa.load(io.BytesIO(data), sr=SAMPLING_RATE, mono=True)
        return wav
    except Exception:
        out = subprocess.run(
            ["ffmpeg", "-i", "pipe:0", "-ar", str(SAMPLING_RATE), "-ac", "1", "-f", "wav", "pipe:1"],
            input=data, capture_output=True, check=True).stdout
        wav, _ = librosa.load(io.BytesIO(out), sr=SAMPLING_RATE, mono=True)
        return wav


@app.post("/emotion")
async def emotion(file: UploadFile):
    wav = to_wave(await file.read())
    return predict(model, fe, wav)
