#!/bin/bash
# 더블클릭하면 '온음' 앱을 종료합니다.
DIR="$(cd "$(dirname "$0")" && pwd)"
URL=http://127.0.0.1:7860

finish() { echo; read -n 1 -s -r -t 10 -p "아무 키나 누르면 창이 닫힙니다."; echo; exit "$1"; }

STATUS=$(curl -sf --max-time 2 "$URL/api/status")
if ! printf '%s' "$STATUS" | grep -q '"my-voice-tts"'; then
  # 앱 없이 남은 합성 프로세스가 있으면 함께 정리
  pkill -f "$DIR/qwen_worker.py" 2>/dev/null
  echo "온음 앱이 실행 중이 아닙니다."
  finish 0
fi

if printf '%s' "$STATUS" | grep -q '"busy":true'; then
  read -r -p "지금 음성을 만드는 중이에요. 그래도 종료할까요? (y/N) " ans
  [[ "$ans" =~ ^[Yy] ]] || { echo "종료를 취소했습니다."; finish 0; }
fi

PIDS=$(lsof -ti tcp:7860 -sTCP:LISTEN)
for pid in $PIDS; do
  # 이 폴더의 app.py 인 경우에만 종료
  ps -o command= -p "$pid" | grep -q "$DIR/app.py" && kill "$pid"
done

for i in $(seq 1 10); do
  curl -sf --max-time 1 "$URL/api/health" >/dev/null || break
  sleep 1
done
if curl -sf --max-time 1 "$URL/api/health" >/dev/null; then
  for pid in $PIDS; do ps -o command= -p "$pid" | grep -q "$DIR/app.py" && kill -9 "$pid"; done
fi
pkill -f "$DIR/qwen_worker.py" 2>/dev/null

echo "온음 앱을 종료했습니다. 다시 켜려면 start.command 를 더블클릭하세요."
finish 0
