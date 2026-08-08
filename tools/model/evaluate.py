"""
What the third stage would actually be worth.

    python3 -m venv .venv && .venv/bin/pip install onnx onnxruntime tokenizers numpy
    curl -L -o model.onnx https://huggingface.co/llmware/protectai-prompt-injection-onnx/resolve/main/model.onnx
    # sha256 67bf6a540e89c3396bdae58be6d091ea837d0cd67e93c5136ad54f57818e1f5c
    .venv/bin/python tools/model/evaluate.py model.onnx

Not a gate: it needs a 704 MB artefact this repository does not carry, so it
cannot run in CI. It is kept because the decision recorded in
`docs/licences.md` rests on numbers, and numbers that cannot be reproduced are
an opinion with decimal places.

Runs the ONNX prompt-injection classifier over the corpus this repository
already gates its rules with, and reports recall and false positives **per
language** — because the corpus was monolingual until 2026-08-08 and the model
is trained on English, which is the whole question.

Nothing here decides anything. It produces the numbers that `docs/licences.md`
says must come before the decision: quantise, measure, then choose.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent


def corpus() -> list[tuple[str, str, bool]]:
    """(name, text, is_injection) — the same cases the rules are gated on."""
    out: list[tuple[str, str, bool]] = []
    for file, label in (("positives", True), ("negatives", False)):
        data = json.loads((ROOT / f"corpora/injections/{file}.json").read_text(encoding="utf-8"))
        for case in data["cases"]:
            out.append((case["name"], case["candidate"]["text"], label))
    return out


def is_cyrillic(text: str) -> bool:
    return any("Ѐ" <= ch <= "ӿ" for ch in text)


def main(model_path: str) -> int:
    tok = Tokenizer.from_file(str(Path(model_path).parent / "tokenizer.json"))
    tok.enable_truncation(max_length=512)

    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inputs = {i.name for i in session.get_inputs()}
    print(f"model inputs: {sorted(inputs)}")

    rows = []
    latencies = []
    for name, text, injection in corpus():
        enc = tok.encode(text)
        feed = {"input_ids": np.array([enc.ids], dtype=np.int64)}
        if "attention_mask" in inputs:
            feed["attention_mask"] = np.array([enc.attention_mask], dtype=np.int64)
        if "token_type_ids" in inputs:
            feed["token_type_ids"] = np.array([enc.type_ids], dtype=np.int64)

        started = time.perf_counter()
        logits = session.run(None, feed)[0][0]
        latencies.append((time.perf_counter() - started) * 1000)

        exp = np.exp(logits - logits.max())
        score = float((exp / exp.sum())[1])
        rows.append((name, injection, score, is_cyrillic(text)))

    for threshold in (0.5, 0.9):
        print(f"\n=== threshold {threshold}")
        for label, wanted in (("Cyrillic", True), ("Latin", False)):
            group = [r for r in rows if r[3] is wanted]
            pos = [r for r in group if r[1]]
            neg = [r for r in group if not r[1]]
            hit = sum(1 for r in pos if r[2] >= threshold)
            false = sum(1 for r in neg if r[2] >= threshold)
            recall = hit / len(pos) if pos else float("nan")
            print(
                f"  {label:9} recall {hit:2}/{len(pos):2} = {recall:.0%}   "
                f"false positives {false:2}/{len(neg):2}"
            )

    latencies.sort()
    print(
        f"\nlatency over {len(latencies)} texts: "
        f"median {latencies[len(latencies) // 2]:.0f} ms, "
        f"p95 {latencies[int(len(latencies) * 0.95)]:.0f} ms, "
        f"max {latencies[-1]:.0f} ms"
    )
    print(f"artefact: {Path(model_path).stat().st_size:,} bytes")

    print("\nmisses (an injection scored below 0.5):")
    for name, injection, score, cyr in rows:
        if injection and score < 0.5:
            print(f"  {score:.2f}  {'RU' if cyr else 'EN'}  {name}")
    print("\nfalse positives (benign text scored at or above 0.5):")
    for name, injection, score, cyr in rows:
        if not injection and score >= 0.5:
            print(f"  {score:.2f}  {'RU' if cyr else 'EN'}  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "model.onnx"))
