#!/bin/bash
# 사용법: ./speak.sh "읽을 문장" [-o 출력.wav]   (자세한 옵션: ./speak.sh -h)
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
exec "$DIR/GPT-SoVITS/.venv/bin/python" "$DIR/speak.py" "$@"
