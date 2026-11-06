"""KEMDy19로 HyunaZ/hubert_emotion을 추가 학습한다 (Colab GPU 용).

서버(server/model.py)와 같은 모델 정의·라벨 순서를 쓰므로, 결과 .ckpt는 그대로 서버의 CKPT 자리에 넣으면 된다.
라벨 순서는 server/model.py의 LABELS(행복, 분노, 혐오, 공포, 중립, 슬픔, 놀람)로 학습하면서 확정된다.

  python training/finetune.py --data /content/KEMDy19 --inspect      # 데이터 구조·라벨 수만 확인
  python training/finetune.py --data /content/KEMDy19 --out /content/out
"""
import argparse
import csv
import io
import random
import re
import sys
import zipfile
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


def read_rows(path: Path):
    for enc in ("utf-8-sig", "cp949", "utf-8"):
        try:
            return list(csv.reader(path.open(encoding=enc)))
        except UnicodeDecodeError:
            continue
    return []


def find_labels(root: Path):
    """annotation csv에서 {발화 id: 라벨}을 모은다.

    KEMDy는 헤더가 두 줄이다: 윗줄 'Segment ID', 'Total Evaluation', 'Eval01F' … / 아랫줄 'Emotion', 'Valence', 'Arousal'.
    평가자별 Emotion 열이 여러 개라서, 다수결 결과인 'Total Evaluation'의 'Emotion' 열만 쓴다.
    표가 한 줄 헤더면 값이 감정 이름으로만 된 열을 자동으로 찾는다. 동률('happy;surprise')은 건너뛴다.
    """
    labels, how, ties = {}, Counter(), 0
    for path in sorted(root.rglob("*.csv")):
        rows = read_rows(path)
        if len(rows) < 3:
            continue
        top, sub = rows[0], rows[1]
        filled, cur = [], ""
        for h in top:  # 윗줄 이름을 오른쪽 빈 칸으로 이어 붙인다
            cur = h.strip() or cur
            filled.append(cur)
        id_col = next((i for i, h in enumerate(top) if "segment" in h.lower()), None)
        lab_col = next((i for i, (t, sb) in enumerate(zip(filled, sub)) if t.lower().startswith("total") and sb.strip().lower() == "emotion"), None)
        body = rows[2:]
        if id_col is None or lab_col is None:  # 한 줄 헤더 표
            body = rows[1:]
            id_col = next((i for i, h in enumerate(top) if re.search(r"segment|id|file", h, re.I)), 0)
            best = None
            for c, name in enumerate(top):
                vals = [r[c].strip().lower() for r in body if len(r) > c and r[c].strip()]
                if vals and all(v.split(";")[0] in EN2KO for v in vals) and (best is None or len(set(vals)) > best[1]):
                    best = (c, len(set(vals)))
            if best is None:
                continue
            lab_col = best[0]
            how["한 줄 헤더: " + top[lab_col]] += 1
        else:
            how["두 줄 헤더: Total Evaluation/Emotion"] += 1
        for r in body:
            if len(r) <= max(id_col, lab_col):
                continue
            lab = r[lab_col].strip().lower()
            if ";" in lab:
                ties += 1
            elif lab in EN2KO:
                labels[r[id_col].strip()] = EN2KO[lab]
    return labels, how, ties


def group_of(wav: Path):
    """(데이터셋, 세션 번호). KEMDy19와 KEMDy20이 둘 다 Session01~04라서 데이터셋 이름을 같이 쓴다."""
    ds = next((p for p in wav.parts if p.upper().startswith("KEMDY")), "")
    m = re.search(r"Sess(?:ion)?\s*0*(\d+)", wav.name, re.I) or re.search(r"Sess(?:ion)?\s*0*(\d+)", str(wav), re.I)
    return ds.upper(), int(m.group(1)) if m else -1


def collect(root: Path):
    labels, how, ties = find_labels(root)
    items = []
    for wav in sorted(root.rglob("*.wav")):
        if wav.stem in labels:
            items.append((wav, LABEL2ID[labels[wav.stem]], group_of(wav)))
    return items, how, ties


ZIPS = {}  # 워커마다 zip을 한 번만 연다


class Clips(Dataset):
    def __init__(self, items, fe, max_sec, train):
        self.items, self.fe, self.n, self.train = items, fe, int(max_sec * SAMPLING_RATE), train

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        path, y, _ = self.items[i]
        if isinstance(path, tuple):  # (zip 경로, 압축 안 파일 이름): 풀지 않고 바로 읽는다
            zf = ZIPS.get(path[0]) or ZIPS.setdefault(path[0], zipfile.ZipFile(path[0]))
            path = io.BytesIO(zf.read(path[1]))
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


AIHUB_NORM = {"anger": "angry", "angry": "angry", "sad": "sadness", "sadness": "sadness", "happiness": "happiness", "happy": "happiness",
              "disgust": "disgust", "fear": "fear", "neutral": "neutral", "surprise": "surprise"}
AIHUB2KO = {"angry": "분노", "sadness": "슬픔", "happiness": "행복", "disgust": "혐오", "fear": "공포", "neutral": "중립", "surprise": "놀람"}


def collect_aihub(zip_path: Path, csv_path: Path, cap: int, seed: int):
    """AI Hub '감정 분류를 위한 대화 음성 데이터셋' 한 해분. 라벨은 평가자 5명 중 3명 이상이 일치한 감정만 쓴다.
    표기가 해마다 달라서(anger/angry, sad/sadness) 먼저 통일한다. 감정마다 최대 cap개만 뽑아 쏠림을 줄인다."""
    rows = read_rows(csv_path)
    members = set(zipfile.ZipFile(zip_path).namelist())
    by_label = {}
    for r in rows[1:]:
        votes = [AIHUB_NORM.get(r[i].strip().lower()) for i in (3, 5, 7, 9, 11) if len(r) > i]
        votes = [v for v in votes if v]
        if not votes:
            continue
        top, cnt = Counter(votes).most_common(1)[0]
        member = r[0].strip() + ".wav"
        if cnt >= 3 and member in members:
            by_label.setdefault(AIHUB2KO[top], []).append(member)
    rng = random.Random(seed)
    items, raw = [], {}
    for lab, ms in by_label.items():
        raw[lab] = len(ms)
        rng.shuffle(ms)
        items += [((str(zip_path), m), LABEL2ID[lab], ("AIHUB", 0)) for m in ms[:cap]]
    return items, raw


def prf(ys, ps, classes):
    """클래스별 F1과 혼동행렬(행=정답, 열=예측)"""
    idx = {c: i for i, c in enumerate(classes)}
    cm = np.zeros((len(classes), len(classes)), dtype=int)
    for a, b in zip(ys, ps):
        if a in idx and b in idx:
            cm[idx[a], idx[b]] += 1
    f1 = {}
    for c in classes:
        tp = sum(1 for a, b in zip(ys, ps) if a == c and b == c)
        fp = sum(1 for a, b in zip(ys, ps) if a != c and b == c)
        fn = sum(1 for a, b in zip(ys, ps) if a == c and b != c)
        f1[c] = 2 * tp / (2 * tp + fp + fn) if (tp + fn) else None  # 검증에 없는 클래스는 계산하지 않는다
    return f1, cm


@torch.no_grad()
def evaluate(model, loader, device, remap):
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        logits, _ = model(x.to(device))
        ps += [remap.get(p, p) for p in logits.argmax(-1).cpu().tolist()]
        ys += [remap.get(v, v) for v in y.tolist()]
    present = sorted(set(ys))
    f1, cm = prf(ys, ps, present)
    macro = float(np.mean([v for v in f1.values() if v is not None]))
    acc = float(np.mean(np.array(ys) == np.array(ps)))
    # 비교 기준: 전부 다수 클래스로만 답했을 때
    sup = Counter(ys)
    m, sm = sup.most_common(1)[0]
    maj_acc = sm / len(ys)
    maj_f1 = (2 * sm / (2 * sm + (len(ys) - sm))) / len(present)
    return {"acc": acc, "f1": macro, "per": f1, "cm": cm, "classes": present, "pred": Counter(ps),
            "maj_acc": maj_acc, "maj_f1": maj_f1, "maj_label": LABELS[m]}


def report(tag, r):
    print(f"[{tag}] 정확도 {r['acc']:.3f} / macro-F1 {r['f1']:.3f}  (전부 '{r['maj_label']}'으로만 답하면 정확도 {r['maj_acc']:.3f} / F1 {r['maj_f1']:.3f})")
    print("   클래스별 F1:", {LABELS[c]: (round(v, 2) if v is not None else '-') for c, v in r["per"].items()})
    print("   예측 분포:", {LABELS[c]: n for c, n in sorted(r["pred"].items())})
    names = [LABELS[c] for c in r["classes"]]
    print("   혼동행렬(행=정답, 열=예측):  " + "  ".join(f"{n:>3}" for n in names))
    for n, row in zip(names, r["cm"]):
        print(f"      {n:>3} | " + "  ".join(f"{v:>3}" for v in row))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="KEMDy 데이터 폴더 (KEMDy19·20이 같이 있어도 됨)")
    ap.add_argument("--aihub-zip", help="AI Hub 감정 음성 zip (예: 4차년도.zip). 풀지 않고 바로 읽는다")
    ap.add_argument("--aihub-csv", help="위 zip의 라벨 csv")
    ap.add_argument("--aihub-cap", type=int, default=1500, help="AI Hub는 감정마다 최대 몇 개까지 쓸지")
    ap.add_argument("--out", default="out")
    ap.add_argument("--inspect", action="store_true", help="학습 없이 데이터만 확인")
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-5)
    ap.add_argument("--unfreeze", type=int, default=4, help="뒤쪽 인코더 층을 몇 개 풀지 (0이면 분류 헤드만)")
    ap.add_argument("--max-sec", type=float, default=8.0)
    ap.add_argument("--val-sessions", type=int, default=1, help="KEMDy 데이터셋마다 번호가 가장 큰 세션 몇 개를 검증용으로 뗄지(화자 누수 방지)")
    ap.add_argument("--merge-negative", action="store_true", help="혐오·공포를 분노로 합쳐 학습·평가 (앱도 '긴장' 하나로 묶어 쓴다)")
    ap.add_argument("--cap-per-class", type=int, default=0, help="학습 데이터에서 감정마다 최대 몇 개까지 쓸지 (0이면 제한 없음)")
    ap.add_argument("--balance", choices=["none", "loss", "sampler"], default="loss", help="쏠림 보정: 손실 가중치 / 소수 클래스 더 자주 뽑기")
    ap.add_argument("--weight-power", type=float, default=0.5, help="가중치 = (최대빈도/빈도)^이 값. 1이면 완전 역비율")
    ap.add_argument("--max-steps", type=int, default=0, help="디버그용: 이 스텝 수에서 멈춤")
    ap.add_argument("--val-limit", type=int, default=0, help="디버그용: 검증 발화를 이 개수만 무작위로 쓴다")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    random.seed(a.seed)
    torch.manual_seed(a.seed)
    remap = {LABEL2ID["혐오"]: LABEL2ID["분노"], LABEL2ID["공포"]: LABEL2ID["분노"]} if a.merge_negative else {}

    items, how, ties = collect(Path(a.data))
    print(f"KEMDy: 라벨이 붙은 발화 {len(items)}개 / 라벨 읽은 방식: {dict(how)} / 동률이라 건너뜀: {ties}개")
    print("   라벨별:", dict(Counter(LABELS[y] for _, y, _ in items)))
    if len(items) < 50:
        sys.exit("라벨이 붙은 wav를 거의 못 찾았어요. --data 경로와 annotation csv 구조를 확인해 주세요.")

    aihub, raw = [], {}
    if a.aihub_zip:
        aihub, raw = collect_aihub(Path(a.aihub_zip), Path(a.aihub_csv), a.aihub_cap, a.seed)
        print(f"AI Hub: 3명 이상 일치한 라벨 {raw} → 감정마다 최대 {a.aihub_cap}개, {len(aihub)}개 사용")
    if a.inspect:
        return

    # KEMDy는 데이터셋마다 번호가 가장 큰 세션을 검증용으로 뗀다. AI Hub는 학습에만 쓴다(화자 정보가 없어 검증에 쓰면 누수가 생긴다).
    by_ds = {}
    for _, _, (ds, sess) in items:
        by_ds.setdefault(ds, set()).add(sess)
    val_groups = {(ds, s) for ds, ss in by_ds.items() if len(ss) > a.val_sessions for s in sorted(ss)[-a.val_sessions:]}
    train = [it for it in items if it[2] not in val_groups] + aihub
    val = [it for it in items if it[2] in val_groups] or train[-max(1, len(train) // 10):]
    if a.val_limit:
        val = random.sample(val, min(a.val_limit, len(val)))
    if remap:
        train = [(p, remap.get(y, y), g) for p, y, g in train]
    if a.cap_per_class:
        rng, grouped, capped = random.Random(a.seed), {}, []
        for it in train:
            grouped.setdefault(it[1], []).append(it)
        for y, lst in grouped.items():
            rng.shuffle(lst)
            capped += lst[: a.cap_per_class]
        train = capped
    tcounts = Counter(y for _, y, _ in train)
    print(f"학습 {len(train)} / 검증 {len(val)} (검증 세션: {sorted(val_groups)})")
    print("   학습 라벨별:", {LABELS[y]: n for y, n in sorted(tcounts.items())})
    print("   검증 라벨별:", dict(Counter(LABELS[remap.get(y, y)] for _, y, _ in val)))

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device:", device)
    ckpt = hf_hub_download(CKPT_REPO, CKPT_FILE)
    model = MyLitModel.load_from_checkpoint(ckpt, audio_model_name=AUDIO_MODEL_NAME, num_label2s=len(LABELS), map_location="cpu")
    model.to(device)

    # 분류 헤드 + 뒤쪽 인코더 층만 학습한다. 강도 헤드는 KEMDy에 라벨이 없어 그대로 둔다.
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
    train_ds = Clips(train, fe, a.max_sec, True)
    freq = np.array([max(tcounts.get(c, 0), 1) for c in range(len(LABELS))], dtype=float)
    ratio = (freq.max() / freq) ** a.weight_power
    if a.balance == "sampler":  # 소수 클래스를 더 자주 뽑는다. 손실 가중치는 겹치지 않게 쓰지 않는다.
        sampler = torch.utils.data.WeightedRandomSampler([ratio[y] for _, y, _ in train], num_samples=len(train), replacement=True)
        tl = DataLoader(train_ds, batch_size=a.batch, sampler=sampler, collate_fn=collate, num_workers=2)
        weight = None
    else:
        tl = DataLoader(train_ds, batch_size=a.batch, shuffle=True, collate_fn=collate, num_workers=2)
        weight = torch.tensor(ratio, dtype=torch.float32, device=device) if a.balance == "loss" else None
    vl = DataLoader(Clips(val, fe, a.max_sec, False), batch_size=a.batch, collate_fn=collate, num_workers=2)
    loss_fn = nn.CrossEntropyLoss(weight=weight)
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.01)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    r0 = evaluate(model, vl, device, remap)
    report("시작 전", r0)
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
            if step % 50 == 0:
                print(f"  step {step} loss {loss.item():.3f}")
            if a.max_steps and step >= a.max_steps:
                break
        r = evaluate(model, vl, device, remap)
        report(f"에폭 {ep}", r)
        if r["f1"] > best:
            best = r["f1"]
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
    ok = best > max(r0["f1"], r0["maj_f1"]) + 0.03
    verdict = "쓸 만함(시작 전과 '전부 다수 클래스' 기준을 모두 넘음)" if ok else "개선 없음: 적용하지 마세요"
    print(f"끝. 시작 전 F1 {r0['f1']:.3f} → 최고 F1 {best:.3f} / 다수 클래스 기준 F1 {r0['maj_f1']:.3f}  → {verdict}")


if __name__ == "__main__":
    main()
