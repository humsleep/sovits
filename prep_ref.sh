#!/bin/bash
# 녹음 파일(m4a/mp3/wav 등)을 목소리로 등록한다 (앞뒤 무음 제거, 음량 정규화, 3~10초 확인).
# 사용법: ./prep_ref.sh 녹음파일.m4a "녹음에서 읽은 문장 그대로" [목소리이름(기본: 기본)]
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
[ $# -ge 2 ] && [ $# -le 3 ] || { echo "사용법: $0 녹음파일 \"읽은 문장\" [목소리이름]"; exit 1; }
exec "$DIR/GPT-SoVITS/.venv/bin/python" -c '
import os, sys
sys.path.insert(0, sys.argv[1])
import engine
src, text = os.path.abspath(sys.argv[2]), sys.argv[3]
name = sys.argv[4] if len(sys.argv) > 4 else engine.DEFAULT_VOICE
try:
    dur = engine.register_voice(src, text, name)
except engine.UserError as e:
    print(f"오류: {e} (기존 목소리는 그대로 둡니다)", file=sys.stderr); sys.exit(1)
print(f"목소리 \"{name}\" 등록 완료 ({dur:.1f}초)")
' "$DIR" "$@"
