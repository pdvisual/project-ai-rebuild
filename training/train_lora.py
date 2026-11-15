#!/usr/bin/env python3
"""QLoRA fine-tuning starter for CLYRO on a Kaggle GPU notebook."""

import argparse
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


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
    parser.add_argument("--data", default="data/train.jsonl")
    parser.add_argument("--output", default="./clyro-qwen3-4b-lora")
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--save-steps", type=int, default=50)
    return parser.parse_args()


def main():
    args = parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU not found. In Kaggle, enable Settings > Accelerator > GPU.")

    if not os.path.isfile(args.data):
        raise SystemExit(f"Training file not found: {args.data}")

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
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    raw = Dataset.from_json(args.data)

    def format_record(example):
        messages = example.get("messages")
        if not isinstance(messages, list) or not messages:
            raise ValueError("Each JSONL row must contain a non-empty 'messages' array.")
        text = tokenizer.apply_chat_template(
            messages,
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
    if len(tokenized) < 2:
        raise SystemExit("Add at least two reviewed training examples before training.")

    training_args = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        fp16=True,
        bf16=False,
        logging_steps=5,
        save_steps=args.save_steps,
        save_total_limit=2,
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
    trainer.train()
    trainer.model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Adapter saved to: {args.output}")


if __name__ == "__main__":
    main()
