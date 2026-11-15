# CLYRO model training (free-cloud prototype)

This folder contains a reproducible QLoRA fine-tuning starter for CLYRO. It does **not** change the live chat backend and does not claim that a model has already been trained.

## Base model

- Model: `Qwen/Qwen3-4B-Instruct-2507`
- License shown on the model card: Apache-2.0. Re-check the model card and license before publishing or distributing an adapter.
- Method: 4-bit QLoRA; only small LoRA adapter weights are trained, not all 4B base parameters.

## Free training route

1. Create a free Kaggle account and open a new Notebook.
2. In Notebook Settings, select an available GPU accelerator. Kaggle documents free GPU access, but availability and weekly quotas are limited and can change.
3. Add this repository as a Kaggle input, or upload the files from this folder.
4. Copy `data/train.jsonl.example` to `/kaggle/working/train.jsonl`, then add your own high-quality examples.
5. Install `requirements.txt` and run:
   `python train_lora.py --data /kaggle/working/train.jsonl --output /kaggle/working/clyro-qwen3-4b-lora`
6. Download the resulting adapter folder from Kaggle outputs. Keep the original base model separate; the adapter is not a standalone model.

The script defaults to conservative settings for a 16 GB GPU (4-bit loading, sequence length 1024, batch size 1, gradient checkpointing). If CUDA runs out of memory, reduce `--max-length` to 768 or 512.

## Dataset format

One JSON object per line, with a `messages` array in chat format:

```json
{"messages":[{"role":"system","content":"Ты — CLYRO, полезный ИИ-помощник. Отвечай ясно и честно."},{"role":"user","content":"Объясни, что такое API простыми словами."},{"role":"assistant","content":"API — это способ, которым две программы обмениваются запросами и ответами."}]}
```

Use examples you own or are allowed to use. Do not put passwords, API keys, private user conversations, personal data, or copyrighted material without permission in the dataset. Start with a few hundred carefully checked examples; quality and consistency matter more than raw volume. Keep a separate held-out test set and compare answers before/after fine-tuning.

## What is and is not free

- Kaggle GPU time is quota-limited and may be unavailable during busy periods. A training run can be interrupted; save checkpoints and outputs.
- Fine-tuning does not make inference free by itself. The trained adapter still needs compute to answer users.
- Hugging Face ZeroGPU can be useful for a demo/prototype, but it has daily quotas, queueing and hosting restrictions; it is not an unlimited production API.
- The existing CLYRO Cloudflare Worker cannot load this custom adapter directly. Do not switch production traffic to it until an inference endpoint is deployed, secured, tested and connected intentionally.

## Next milestones

1. Build and review the dataset.
2. Run a short smoke-test training job.
3. Evaluate Russian, English, coding, refusal/safety and instruction-following prompts.
4. Export the adapter and test inference in a separate prototype.
5. Only then consider a guarded CLYRO backend integration with timeouts, rate limits and fallback to existing providers.
