#!/usr/bin/env python3
"""QLoRA fine-tuning for CLYRO. Supports automatic checkpoint resume."""

import argparse
import json
import os

import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForLanguageModeling,
    Trainer,
    TrainingArguments,
)
from transformers.trainer_utils import get_last_checkpoint


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
    parser.add_argument("--data", default="training/data/train.jsonl")
    parser.add_argument("--output", default="./clyro-qwen3-4b-lora")
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--save-steps", type=int, default=25)
    parser.add_argument(
        "--resume-from-checkpoint",
        default="auto",
        help="'auto' resumes the latest checkpoint in output; 'none' starts fresh; or pass a checkpoint path.",
    )
    parser.add_argument(
        "--allow-small-dataset",
        action="store_true",
        help="Allow fewer than 100 examples (only for a short technical smoke test).",
    )
    return parser.parse_args()


def load_and_validate_data(path, allow_small):
    if not os.path.isfile(path):
        raise SystemExit(f"Training file not found: {path}")

    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"Invalid JSON on line {line_no}: {exc}")
            messages = row.get("messages")
            if not isinstance(messages, list) or len(messages) < 2:
                raise SystemExit(
                    f"Line {line_no}: each row needs a messages array with user and assistant messages."
                )
            roles = {m.get("role") for m in messages if isinstance(m, dict)}
            if "user" not in roles or "assistant" not in roles:
                raise SystemExit(
                    f"Line {line_no}: messages must include both user and assistant roles."
                )
            records.append(row)

    minimum = 2 if allow_small else 100
    if len(records) < minimum:
        raise SystemExit(
            f"Only {len(records)} examples found. Need at least {minimum}. "
            "Add reviewed examples first. For a technical smoke test only, add --allow-small-dataset."
        )
    print(f"Validated training examples: {len(records)}")
    return Dataset.from_list(records)


def main():
    args = parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU not found. In Colab, select Runtime > Change runtime type > T4 GPU.")

    raw = load_and_validate_data(args.data, args.allow_small_dataset)
    os.makedirs(args.output, exist_ok=True)

    resume_checkpoint = None
    if args.resume_from_checkpoint == "auto":
        resume_checkpoint = get_last_checkpoint(args.output)
    elif args.resume_from_checkpoint.lower() != "none":
        resume_checkpoint = args.resume_from_checkpoint

    if resume_checkpoint:
        print(f"Resuming from checkpoint: {resume_checkpoint}")
    else:
        print("No checkpoint found; starting a new training run.")

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quant_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=quant_config,
        device_map="auto",
        torch_dtype=torch.float16,
        trust_remote_code=True,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)
    model.gradient_checkpointing_enable()

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    def format_record(example):
        text = tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )
        return {"text": text}

    formatted = raw.map(format_record, remove_columns=raw.column_names)

    def tokenize_batch(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            max_length=args.max_length,
            padding=False,
        )

    tokenized = formatted.map(tokenize_batch, batched=True, remove_columns=["text"])

    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        fp16=True,
        bf16=False,
        logging_steps=5,
        save_strategy="steps",
        save_steps=args.save_steps,
        save_total_limit=3,
        optim="paged_adamw_8bit",
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        gradient_checkpointing=True,
        report_to="none",
        remove_unused_columns=False,
        dataloader_pin_memory=True,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False),
    )

    trainer.train(resume_from_checkpoint=resume_checkpoint)
    trainer.model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Final LoRA adapter saved to: {args.output}")


if __name__ == "__main__":
    main()
