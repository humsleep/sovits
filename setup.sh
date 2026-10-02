#!/bin/bash
# 온음 설치 스크립트 (Apple Silicon Mac). 이 폴더에서 한 번 실행: ./setup.sh
# 필요: Homebrew, 약 15GB 디스크. 모델 다운로드에 시간이 걸립니다.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"

GSV_COMMIT=48b1a0169a28582a8984402f82cf438d3bfa6aca
HF=https://huggingface.co/XXXXRT/GPT-SoVITS-Pretrained/resolve/main
QWEN_MODEL=mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit

step() { printf '\n== %s\n' "$*"; }

step "도구 확인 (ffmpeg, uv)"
command -v brew >/dev/null || { echo "Homebrew 가 필요합니다: https://brew.sh"; exit 1; }
command -v ffmpeg >/dev/null || brew install ffmpeg
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

step "빠른 모드 엔진: GPT-SoVITS ($GSV_COMMIT)"
if [ ! -d GPT-SoVITS/.git ]; then
  git clone https://github.com/RVC-Boss/GPT-SoVITS.git
fi
git -C GPT-SoVITS fetch -q origin "$GSV_COMMIT" 2>/dev/null || git -C GPT-SoVITS fetch -q --unshallow || true
git -C GPT-SoVITS checkout -q "$GSV_COMMIT"
[ -x GPT-SoVITS/.venv/bin/python ] || "$UV" venv -p 3.10 GPT-SoVITS/.venv
"$UV" pip install --python GPT-SoVITS/.venv/bin/python -r requirements/sovits-lock.txt

if [ ! -d GPT-SoVITS/GPT_SoVITS/pretrained_models/v2Pro ]; then
  step "GPT-SoVITS 사전학습 모델 다운로드 (약 4.2GB)"
  curl -L --retry 5 -o GPT-SoVITS/pretrained_models.zip "$HF/pretrained_models.zip"
  unzip -q -o GPT-SoVITS/pretrained_models.zip -d GPT-SoVITS/GPT_SoVITS && rm GPT-SoVITS/pretrained_models.zip
fi
if [ ! -d GPT-SoVITS/.venv/nltk_data ]; then
  curl -L --retry 5 -o GPT-SoVITS/nltk_data.zip "$HF/nltk_data.zip"
  unzip -q -o GPT-SoVITS/nltk_data.zip -d GPT-SoVITS/.venv && rm GPT-SoVITS/nltk_data.zip
fi

step "고품질 엔진: Qwen3-TTS (MLX)"
[ -x .venv-mlx/bin/python ] || "$UV" venv -p 3.12 .venv-mlx
"$UV" pip install --python .venv-mlx/bin/python -r requirements/mlx-lock.txt
step "Qwen3-TTS 모델 다운로드 (약 3.1GB)"
.venv-mlx/bin/python -c "from mlx_audio.tts.utils import load_model; load_model('$QWEN_MODEL')"

chmod +x start.command end.command speak.sh prep_ref.sh say_selection.sh
step "설치 완료. start.command 를 더블클릭해 실행하세요."
