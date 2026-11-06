import torch
from torch import nn
from transformers import AutoConfig, HubertForSequenceClassification
import pytorch_lightning as pl

# HyunaZ/hubert_emotion README 원문 그대로
class MyLitModel(pl.LightningModule):
    def __init__(self, audio_model_name, num_label2s, n_layers=1, projector=True, classifier=True, dropout=0.07, lr_decay=1):
        super(MyLitModel, self).__init__()
        self.config = AutoConfig.from_pretrained(audio_model_name)
        self.config.output_hidden_states = True
        self.audio_model = HubertForSequenceClassification.from_pretrained(audio_model_name, config=self.config)
        self.label2_classifier = nn.Linear(self.audio_model.config.hidden_size, num_label2s)
        self.intensity_regressor = nn.Linear(self.audio_model.config.hidden_size, 1)

    def forward(self, audio_values, audio_attn_mask=None):
        outputs = self.audio_model(input_values=audio_values, attention_mask=audio_attn_mask)
        label2_logits = self.label2_classifier(outputs.hidden_states[-1][:, 0, :])
        intensity_preds = self.intensity_regressor(outputs.hidden_states[-1][:, 0, :]).squeeze(-1)
        return label2_logits, intensity_preds


AUDIO_MODEL_NAME = "team-lucid/hubert-base-korean"
CKPT_REPO = "HyunaZ/hubert_emotion"
CKPT_FILE = "fold_idx=11_epoch=28-val_acc_label2=0.4819.ckpt"
LABELS = ["행복", "분노", "혐오", "공포", "중립", "슬픔", "놀람"]
SAMPLING_RATE = 16000


def load_model():
    from huggingface_hub import hf_hub_download
    from transformers import AutoFeatureExtractor

    ckpt = hf_hub_download(CKPT_REPO, CKPT_FILE)
    model = MyLitModel.load_from_checkpoint(
        ckpt,
        audio_model_name=AUDIO_MODEL_NAME,
        num_label2s=len(LABELS),
        map_location="cpu",
    )
    model.eval()
    fe = AutoFeatureExtractor.from_pretrained(AUDIO_MODEL_NAME)
    return model, fe


def predict(model, fe, wav):
    # wav: 16kHz mono float numpy array
    inputs = fe(raw_speech=wav, return_tensors="pt", sampling_rate=SAMPLING_RATE)
    with torch.no_grad():
        logits, intensity = model(inputs["input_values"])
    idx = int(torch.argmax(logits, dim=-1).item())
    return {"emotion": LABELS[idx], "intensity": float(intensity.item()), "scores": logits.softmax(-1)[0].tolist()}
