# tts_bg_edge.py
# pip install edge-tts
import asyncio
from pathlib import Path

import edge_tts

INPUT_DIR = Path(r"C:\\Users\\Mihail Petrov\\Desktop\\voice\\input")
OUT_DIR = Path(r"C:\\Users\\Mihail Petrov\\Desktop\\voice\\output")
VOICE = "bg-BG-KalinaNeural"
RATE = "+0%"
MAX_PARALLEL = 4
MAX_RETRIES = 3
RETRY_DELAY_SEC = 5
SKIP_EXISTING = True
ENCODINGS = ("utf-8-sig", "cp1251")


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ENCODINGS:
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Непознато кодиране: {path}")


async def synthesize(sem: asyncio.Semaphore, src: Path) -> str:
    dst = OUT_DIR / f"{src.stem}.mp3"
    if SKIP_EXISTING and dst.exists() and dst.stat().st_size > 0:
        return f"SKIP {src}"
    tmp = dst.with_suffix(".part")
    async with sem:
        text = read_text(src)
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(tmp))
                tmp.replace(dst)
                return f"OK   {src} -> {dst}"
            except Exception as e:
                if attempt == MAX_RETRIES:
                    tmp.unlink(missing_ok=True)
                    return f"ERR  {src} : {e}"
                await asyncio.sleep(RETRY_DELAY_SEC)


async def main() -> None:
    files = sorted(INPUT_DIR.glob("*.txt"))
    if not files:
        raise SystemExit(f"Няма .txt файлове в {INPUT_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(MAX_PARALLEL)
    tasks = [asyncio.create_task(synthesize(sem, f)) for f in files]
    for t in asyncio.as_completed(tasks):
        print(await t)


if __name__ == "__main__":
    asyncio.run(main())