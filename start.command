#!/bin/bash
# 더블클릭하면 '내 목소리 TTS' 앱을 켜고 브라우저를 엽니다. 이 창을 닫으면 앱이 종료됩니다.
umask 077
DIR="$(cd "$(dirname "$0")" && pwd)"
URL=http://127.0.0.1:7860
is_ours() { curl -sf --max-time 2 "$URL/api/health" | grep -q '"my-voice-tts"'; }
if is_ours; then open "$URL"; echo "이미 실행 중입니다. 브라우저를 열었습니다."; exit 0; fi
if lsof -nP -iTCP:7860 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "오류: 7860 포트를 다른 프로그램이 쓰고 있습니다. 그 프로그램을 끈 뒤 다시 실행하세요."
  lsof -nP -iTCP:7860 -sTCP:LISTEN
  read -n 1 -s -r -p "아무 키나 누르면 닫힙니다."; exit 1
fi
( for i in $(seq 1 60); do sleep 1; is_ours && { open "$URL"; break; }; done ) &
exec "$DIR/GPT-SoVITS/.venv/bin/python" "$DIR/app.py"
