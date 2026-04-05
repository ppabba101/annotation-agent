"""
Phase 1.5: DiffusionPen evaluation on Modal cloud GPU.

Run with:
    modal run backend/src/ml/eval_diffusionpen.py

Downloads all weights at image build time so runtime is fast.
"""

import modal

# Build image with ALL dependencies and model weights pre-cached
diffusionpen_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git")
    .pip_install(
        "torch==2.1.2",
        "torchvision==0.16.2",
        "diffusers==0.24.0",
        "transformers==4.36.2",
        "Pillow==10.2.0",
        "numpy==1.26.3",
        "timm==0.9.12",
        "einops==0.7.0",
        "huggingface_hub==0.20.3",
        "omegaconf",
        "scipy",
        "tqdm",
    )
    .run_commands(
        # Clone DiffusionPen repo for model code
        "git clone --depth 1 https://github.com/koninik/DiffusionPen.git /opt/DiffusionPen",
        # Pre-download ALL model weights into HF cache
        "python -c \""
        "from huggingface_hub import hf_hub_download; "
        "hf_hub_download('konnik/DiffusionPen', 'diffusionpen_iam_model_path/models/ema_ckpt.pt'); "
        "hf_hub_download('konnik/DiffusionPen', 'style_models/iam_style_diffusionpen.pth'); "
        "print('DiffusionPen weights cached')\"",
        # Pre-download CANINE model
        "python -c \"from transformers import CanineTokenizer, CanineModel; "
        "CanineTokenizer.from_pretrained('google/canine-c'); "
        "CanineModel.from_pretrained('google/canine-c'); "
        "print('CANINE cached')\"",
        # Pre-download SD v1.5 VAE
        "python -c \"from diffusers import AutoencoderKL, DDIMScheduler; "
        "AutoencoderKL.from_pretrained('stable-diffusion-v1-5/stable-diffusion-v1-5', subfolder='vae'); "
        "DDIMScheduler.from_pretrained('stable-diffusion-v1-5/stable-diffusion-v1-5', subfolder='scheduler'); "
        "print('SD VAE cached')\"",
    )
)

app = modal.App("annotation-agent-eval-v3", image=diffusionpen_image)


@app.function(gpu="A10G", timeout=600)
def generate_test_samples():
    """Run DiffusionPen inference — all weights pre-cached in image."""
    import sys
    import os
    import random
    import time

    sys.path.insert(0, "/opt/DiffusionPen")

    import torch
    import torch.nn as nn
    import torchvision
    from torchvision import transforms
    from diffusers import AutoencoderKL, DDIMScheduler
    from transformers import CanineModel, CanineTokenizer
    from huggingface_hub import hf_hub_download
    from PIL import Image
    from io import BytesIO

    device = "cuda"

    print("=== DiffusionPen Inference Test ===")
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # Import DiffusionPen modules
    from unet import UNetModel
    from feature_extractor import ImageEncoder

    style_classes = 339
    vocab_size = 80

    # Load CANINE (pre-cached)
    print("Loading CANINE...")
    tokenizer = CanineTokenizer.from_pretrained("google/canine-c")
    text_encoder = CanineModel.from_pretrained("google/canine-c").to(device)
    text_encoder.eval()

    # Load UNet architecture
    print("Loading UNet...")
    unet = UNetModel(
        image_size=(64, 256), in_channels=4, model_channels=320, out_channels=4,
        num_res_blocks=1, attention_resolutions=(1, 1), channel_mult=(1, 1),
        num_heads=4, num_classes=style_classes, context_dim=320,
        vocab_size=vocab_size, text_encoder=text_encoder,
        args=type("Args", (), {
            "img_feat": True, "emb_dim": 320,
            "model_name": "diffusionpen", "text_encoder_type": "canine",
            "interpolation": False, "mix_rate": None,
        })(),
    ).to(device)

    # Load weights (pre-cached via hf_hub_download in image build)
    ckpt_path = hf_hub_download("konnik/DiffusionPen", "diffusionpen_iam_model_path/models/ema_ckpt.pt")
    print(f"Loading checkpoint: {ckpt_path}")
    state_dict = torch.load(ckpt_path, map_location=device)
    new_state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
    unet.load_state_dict(new_state_dict, strict=False)
    unet.eval()

    # Load VAE + DDIM (pre-cached)
    print("Loading VAE...")
    vae = AutoencoderKL.from_pretrained("stable-diffusion-v1-5/stable-diffusion-v1-5", subfolder="vae").to(device)
    vae.eval()
    ddim = DDIMScheduler.from_pretrained("stable-diffusion-v1-5/stable-diffusion-v1-5", subfolder="scheduler")

    # Load style encoder (pre-cached)
    print("Loading style encoder...")
    feature_extractor = ImageEncoder(model_name="mobilenetv2_100", num_classes=0, pretrained=True, trainable=True)
    style_path = hf_hub_download("konnik/DiffusionPen", "style_models/iam_style_diffusionpen.pth")
    style_state = torch.load(style_path, map_location=device)
    model_dict = feature_extractor.state_dict()
    style_state = {k: v for k, v in style_state.items() if k in model_dict and model_dict[k].shape == v.shape}
    model_dict.update(style_state)
    feature_extractor.load_state_dict(model_dict)
    feature_extractor = feature_extractor.to(device)
    feature_extractor.eval()

    print("All models loaded!")

    # ---- Generate ----
    test_words = ["Hello", "World", "quick", "brown", "fox", "jumps", "test"]
    results = []

    for word in test_words:
        style_idx = random.randint(0, style_classes - 1)
        labels = torch.tensor([style_idx]).long().to(device)

        print(f"\nGenerating: '{word}' (style {style_idx})...")
        start = time.time()

        try:
            # Tokenize — context must be a dict for text_encoder(**context) inside UNet
            context = tokenizer(word, return_tensors="pt", padding="max_length", max_length=40, truncation=True)
            context = {k: v.to(device) for k, v in context.items()}

            # Style: get embedding from feature_extractor
            # In real usage, these would be 5 real handwriting sample images
            # For eval, use random noise as style reference (will produce random style)
            dummy_style_imgs = torch.randn(5, 3, 64, 256, device=device)
            style_features = feature_extractor(dummy_style_imgs)  # [5, feat_dim]

            noise = torch.randn((1, 4, 8, 32), device=device)
            ddim.set_timesteps(50)

            sample = noise
            with torch.no_grad():
                for t in ddim.timesteps:
                    t_batch = torch.tensor([t], device=device).long()
                    # UNet forward: style_extractor= style features tensor (overwrites y internally)
                    noise_pred = unet(
                        sample, t_batch,
                        context=context,
                        y=labels,  # gets overwritten by style_extractor inside UNet
                        style_extractor=style_features,  # pre-computed style features tensor
                    )
                    sample = ddim.step(noise_pred, t, sample).prev_sample

                sample = sample / vae.config.scaling_factor
                image = vae.decode(sample).sample
                image = ((image + 1) / 2).clamp(0, 1)

            elapsed = time.time() - start
            img_pil = torchvision.transforms.ToPILImage()(image.squeeze(0).cpu())
            buf = BytesIO()
            img_pil.save(buf, format="PNG")

            results.append({
                "word": word, "style": style_idx,
                "time_seconds": elapsed,
                "image_bytes": buf.getvalue(),
                "width": img_pil.width, "height": img_pil.height,
            })
            print(f"  Done in {elapsed:.2f}s ({img_pil.width}x{img_pil.height})")

        except Exception as e:
            import traceback
            elapsed = time.time() - start
            print(f"  ERROR: {e}")
            traceback.print_exc()
            results.append({"word": word, "style": style_idx, "time_seconds": elapsed, "error": str(e)})

    successful = [r for r in results if "error" not in r]
    print(f"\n=== Results ===")
    print(f"Generated: {len(successful)}/{len(test_words)} words")
    if successful:
        avg = sum(r["time_seconds"] for r in successful) / len(successful)
        print(f"Avg time/word: {avg:.2f}s")
        print(f"Est. time/page (50 words): {avg * 50:.1f}s")

    return results


@app.local_entrypoint()
def main():
    import os

    print("Running DiffusionPen inference on A10G GPU...")
    results = generate_test_samples.remote()

    output_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "eval_output")
    os.makedirs(output_dir, exist_ok=True)

    for r in results:
        if "image_bytes" in r:
            fname = f"{r['word']}_style{r['style']}.png"
            with open(os.path.join(output_dir, fname), "wb") as f:
                f.write(r["image_bytes"])
            print(f"  Saved {fname} ({r['time_seconds']:.2f}s)")
        elif "error" in r:
            print(f"  FAILED: {r['word']} — {r['error']}")

    successful = [r for r in results if "error" not in r]
    if successful:
        avg = sum(r["time_seconds"] for r in successful) / len(successful)
        print(f"\n=== EVALUATION SUMMARY ===")
        print(f"Words generated: {len(successful)}/{len(results)}")
        print(f"Avg time/word: {avg:.2f}s")
        print(f"Est. time/page (50 words): {avg * 50:.1f}s")
        print(f"60s budget: {'PASS' if avg * 50 < 60 else 'FAIL'}")
        print(f"Output: {output_dir}/")
    else:
        print("\nAll generations failed. Check errors above.")
