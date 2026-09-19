"""
JARVIS — Motor de wake word (openWakeWord)
Escucha continuamente el micrófono y avisa por stdout ("WAKE")
cuando detecta la palabra clave "Hey Jarvis". 100% local, sin
cuentas ni API keys de por medio.
"""

import sys
import time
import numpy as np
import sounddevice as sd
from openwakeword.model import Model
from openwakeword.utils import download_models

SAMPLE_RATE = 16000
FRAME_SAMPLES = 1280  # 80ms a 16kHz, el tamaño recomendado por openWakeWord
THRESHOLD = 0.5
COOLDOWN_SECONDS = 2.0

print("[WAKE-PY] Descargando/verificando modelo 'hey_jarvis'...", file=sys.stderr, flush=True)
download_models(["hey_jarvis"])
model = Model(wakeword_models=["hey_jarvis"])

last_trigger = 0.0


def audio_callback(indata, frames, time_info, status):
    global last_trigger
    if status:
        print(f"[WAKE-PY] status: {status}", file=sys.stderr, flush=True)

    audio = indata[:, 0]
    prediction = model.predict(audio)

    for _, score in prediction.items():
        if score > THRESHOLD and (time.time() - last_trigger) > COOLDOWN_SECONDS:
            last_trigger = time.time()
            print("WAKE", flush=True)


def main():
    print("[WAKE-PY] Escuchando 'Hey Jarvis'...", file=sys.stderr, flush=True)
    with sd.InputStream(
        channels=1,
        samplerate=SAMPLE_RATE,
        blocksize=FRAME_SAMPLES,
        dtype="int16",
        callback=audio_callback,
    ):
        while True:
            sd.sleep(100)


if __name__ == "__main__":
    main()
