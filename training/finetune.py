"""KEMDy19로 HyunaZ/hubert_emotion을 추가 학습한다 (Colab GPU 용).

서버(server/model.py)와 같은 모델 정의·라벨 순서를 쓰므로, 결과 .ckpt는 그대로 서버의 CKPT 자리에 넣으면 된다.
라벨 순서는 server/model.py의 LABELS(행복, 분노, 혐오, 공포, 중립, 슬픔, 놀람)로 학습하면서 확정된다.

  python training/finetune.py --data /content/KEMDy19 --inspect      # 데이터 구조·라벨 수만 확인
  python training/finetune.py --data /content/KEMDy19 --out /content/out
"""
import argparse
import csv
import random
import re
import sys
from collections import Counter
from pathlib import Path

import librosa
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoFeatureExtractor

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from model import AUDIO_MODEL_NAME, CKPT_FILE, CKPT_REPO, LABELS, SAMPLING_RATE, MyLitModel  # noqa: E402

# KEMDy19 영어 라벨 → 서버 라벨
EN2KO = {"happy": "행복", "angry": "분노", "disgust": "혐오", "fear": "공포", "neutral": "중립", "sad": "슬픔", "surprise": "놀람"}
LABEL2ID = {name: i for i, name in enumerate(LABELS)}


def find_labels(root: Path):
    """annotation csv에서 {발화 id: 라벨}을 모은다. 라벨 열은 값이 감정 이름으로만 이뤄진 열을 자동으로 찾는다."""
    labels, used_cols = {}, Counter()
    for path in root.rglob("*.csv"):
        for enc in ("utf-8-sig", "cp949", "utf-8"):
            try:
                rows = list(csv.reader(path.open(encoding=enc)))
                break
            except UnicodeDecodeError:
                rows = []
        if len(rows) < 2:
            continue
        header, body = rows[0], rows[1:]
        id_col = next((i for i, h in enumerate(header) if re.search(r"segment|id|file", h, re.I)), 0)
        best = None
        for c, name in enumerate(header):
            vals = [r[c].strip().lower() for r in body if len(r) > c and r[c].strip()]
            if vals and all(v in EN2KO for v in vals) and (best is None or len(set(vals)) > best[1]):
                best = (c, len(set(vals)))
        if best is None:
            continue
        used_cols[header[best[0]]] += 1
        for r in body:
            if len(r) > max(id_col, best[0]):
                lab = r[best[0]].strip().lower()
                if lab in EN2KO:
                    labels[r[id_col].strip()] = EN2KO[lab]
    return labels, used_cols


def collect(root: Path):
    labels, cols = find_labels(root)
    items = []
    for wav in root.rglob("*.wav"):
        if wav.stem in labels:
            m = re.search(r"Sess(?:ion)?\s*0*(\d+)", str(wav), re.I)
            items.append((wav, LABEL2ID[labels[wav.stem]], int(m.group(1)) if m else -1))
    return items, cols


class Clips(Dataset):
    def __init__(self, items, fe, max_sec, train):
        self.items, self.fe, self.n, self.train = items, fe, int(max_sec * SAMPLING_RATE), train

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        path, y, _ = self.items[i]
        wav, _ = librosa.load(path, sr=SAMPLING_RATE, mono=True)
        if len(wav) > self.n:
            start = random.randint(0, len(wav) - self.n) if self.train else (len(wav) - self.n) // 2
            wav = wav[start:start + self.n]
        x = self.fe(raw_speech=wav, sampling_rate=SAMPLING_RATE, return_tensors="pt")["input_values"][0]
        return x, y


def collate(batch):
    n = max(len(x) for x, _ in batch)
    xs = torch.zeros(len(batch), n)
    for i, (x, _) in enumerate(batch):
        xs[i, : len(x)] = x
    return xs, torch.tensor([y for _, y in batch])


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        logits, _ = model(x.to(device))
        ps += logits.argmax(-1).cpu().tolist()
        ys += y.tolist()
    acc = float(np.mean(np.array(ys) == np.array(ps)))
    f1s = []
    for c in range(len(LABELS)):
        tp = sum(1 for a, b in zip(ys, ps) if a == c and b == c)
        fp = sum(1 for a, b in zip(ys, ps) if a != c and b == c)
        fn = sum(1 for a, b in zip(ys, ps) if a == c and b != c)
        if tp + fn:
            f1s.append(2 * tp / (2 * tp + fp + fn))
    return acc, float(np.mean(f1s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="KEMDy19 압축을 푼 폴더")
    ap.add_argument("--out", default="out")
    ap.add_argument("--inspect", action="store_true", help="학습 없이 데이터만 확인")
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-5)
    ap.add_argument("--unfreeze", type=int, default=4, help="뒤쪽 인코더 층을 몇 개 풀지 (0이면 분류 헤드만)")
    ap.add_argument("--max-sec", type=float, default=8.0)
    ap.add_argument("--val-sessions", type=int, default=4, help="번호가 가장 큰 세션 몇 개를 검증용으로 뗄지(화자 누수 방지)")
    ap.add_argument("--max-steps", type=int, default=0, help="디버그용: 이 스텝 수에서 멈춤")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    random.seed(a.seed)
    torch.manual_seed(a.seed)
    items, cols = collect(Path(a.data))
    counts = Counter(LABELS[y] for _, y, _ in items)
    print(f"라벨이 붙은 발화 {len(items)}개 / 사용한 라벨 열: {dict(cols)}")
    print("라벨별:", dict(counts))
    if len(items) < 50:
        sys.exit("라벨이 붙은 wav를 거의 못 찾았어요. --data 경로와 annotation csv 구조를 확인해 주세요.")
    if a.inspect:
        return

    sessions = sorted({s for _, _, s in items})
    val_s = set(sessions[-a.val_sessions:]) if len(sessions) > a.val_sessions else set()
    train = [it for it in items if it[2] not in val_s]
    val = [it for it in items if it[2] in val_s] or train[-max(1, len(train) // 10):]
    print(f"학습 {len(train)} / 검증 {len(val)} (검증 세션: {sorted(val_s)})")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device:", device)
    ckpt = hf_hub_download(CKPT_REPO, CKPT_FILE)
    model = MyLitModel.load_from_checkpoint(ckpt, audio_model_name=AUDIO_MODEL_NAME, num_label2s=len(LABELS), map_location="cpu")
    model.to(device)

    # 분류 헤드 + 뒤쪽 인코더 층만 학습한다. 강도 헤드는 라벨이 없어 그대로 둔다.
    for p in model.parameters():
        p.requires_grad = False
    for p in model.label2_classifier.parameters():
        p.requires_grad = True
    if a.unfreeze:
        for layer in model.audio_model.hubert.encoder.layers[-a.unfreeze:]:
            for p in layer.parameters():
                p.requires_grad = True
    params = [p for p in model.parameters() if p.requires_grad]
    print(f"학습 파라미터 {sum(p.numel() for p in params) / 1e6:.1f}M")

    fe = AutoFeatureExtractor.from_pretrained(AUDIO_MODEL_NAME)
    tl = DataLoader(Clips(train, fe, a.max_sec, True), batch_size=a.batch, shuffle=True, collate_fn=collate, num_workers=2)
    vl = DataLoader(Clips(val, fe, a.max_sec, False), batch_size=a.batch, collate_fn=collate, num_workers=2)

    # 중립이 압도적으로 많아서 라벨 빈도의 역제곱근으로 가중한다
    freq = np.array([max(counts.get(n, 0), 1) for n in LABELS], dtype=float)
    weight = torch.tensor((freq.max() / freq) ** 0.5, dtype=torch.float32, device=device)
    loss_fn = nn.CrossEntropyLoss(weight=weight)
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.01)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    acc0, f10 = evaluate(model, vl, device)
    print(f"[시작 전] 검증 정확도 {acc0:.3f} / macro-F1 {f10:.3f}")
    best, step = -1.0, 0
    for ep in range(1, a.epochs + 1):
        model.train()
        for x, y in tl:
            logits, _ = model(x.to(device))
            loss = loss_fn(logits, y.to(device))
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step()
            step += 1
            if step % 20 == 0:
                print(f"  step {step} loss {loss.item():.3f}")
            if a.max_steps and step >= a.max_steps:
                break
        acc, f1 = evaluate(model, vl, device)
        print(f"[에폭 {ep}] 검증 정확도 {acc:.3f} / macro-F1 {f1:.3f}")
        if f1 > best:
            best = f1
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "hyper_parameters": {"audio_model_name": AUDIO_MODEL_NAME, "num_label2s": len(LABELS)},
                    "epoch": ep,
                    "global_step": step,
                    "pytorch-lightning_version": "2.0.0",
                },
                out / "hubert_emotion_kemdy19.ckpt",
            )
            print("  → 저장:", out / "hubert_emotion_kemdy19.ckpt")
        if a.max_steps and step >= a.max_steps:
            break
    print(f"끝. 시작 전 F1 {f10:.3f} → 최고 F1 {best:.3f}")


if __name__ == "__main__":
    main()
