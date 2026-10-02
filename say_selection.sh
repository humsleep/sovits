#!/bin/bash
# 표준입력(또는 인자)의 텍스트를 내 목소리로 바로 재생한다. 앱이 꺼져 있으면 켠다.
# macOS 단축어: '셸 스크립트 실행' (입력: 선택한 텍스트, stdin 으로 전달) → 이 파일 경로
# 클립보드 읽기: pbpaste | ./say_selection.sh
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
URL=http://127.0.0.1:7860
is_ours() { curl -sf --max-time 2 "$URL/api/health" | grep -q '"my-voice-tts"'; }
TEXT="${*:-$(cat)}"
[[ "$TEXT" =~ [^[:space:]] ]] || exit 0
if ! is_ours; then
  if lsof -nP -iTCP:7860 -sTCP:LISTEN >/dev/null 2>&1; then
    osascript -e 'display notification "7860 포트를 다른 프로그램이 쓰고 있습니다." with title "내 목소리 TTS"'; exit 1
  fi
  open "$DIR/start.command"
  for i in $(seq 1 90); do sleep 1; is_ours && break; done
  is_ours || { osascript -e 'display notification "앱을 시작하지 못했습니다." with title "내 목소리 TTS"'; exit 1; }
fi
BODY=$(TEXT="$TEXT" "$DIR/GPT-SoVITS/.venv/bin/python" -c 'import json,os; print(json.dumps({"text": os.environ["TEXT"]}))')
OUT=$(curl -sS --max-time 3600 -X POST -H 'Content-Type: application/json' --data "$BODY" "$URL/api/say" -w '\n%{http_code}')
CODE="${OUT##*$'\n'}"
if [ "$CODE" != "200" ]; then
  MSG=$(printf '%s' "${OUT%$'\n'*}" | "$DIR/GPT-SoVITS/.venv/bin/python" -c 'import json,sys
try: print(json.load(sys.stdin).get("detail","오류"))
except Exception: print("오류")')
  osascript -e "display notification \"${MSG//[\"\\]/}\" with title \"내 목소리 TTS\""; exit 1
fi
