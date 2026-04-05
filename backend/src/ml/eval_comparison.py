"""
ML Model Comparison: DiffusionPen vs DiffBrush vs One-DM

Evaluates three handwriting synthesis approaches side-by-side on the same
test text, comparing output quality, speed, and generation capabilities.

Run with:
    modal run backend/src/ml/eval_comparison.py

DiffusionPen weights auto-download from HuggingFace.
DiffBrush and One-DM weights require manual Google Drive download.
"""

import modal

# ---------------------------------------------------------------------------
# Modal image: install deps, clone repos, pre-cache downloadable weights
# ---------------------------------------------------------------------------
comparison_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1-mesa-glx", "libglib2.0-0")
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
        "opencv-python-headless==4.9.0.80",
        "lmdb",
        "pyyaml",
    )
    .run_commands(
        # Clone all three repos
        "git clone --depth 1 https://github.com/koninik/DiffusionPen.git /opt/DiffusionPen",
        "git clone --depth 1 https://github.com/dailenson/DiffBrush.git /opt/DiffBrush",
        "git clone --depth 1 https://github.com/dailenson/One-DM.git /opt/One-DM",
        # Pre-download DiffusionPen weights (HuggingFace — always available)
        "python -c \""
        "from huggingface_hub import hf_hub_download; "
        "hf_hub_download('konnik/DiffusionPen', 'diffusionpen_iam_model_path/models/ema_ckpt.pt'); "
        "hf_hub_download('konnik/DiffusionPen', 'style_models/iam_style_diffusionpen.pth'); "
        "print('DiffusionPen weights cached')\"",
        # Pre-download CANINE tokenizer/model
        "python -c \"from transformers import CanineTokenizer, CanineModel; "
        "CanineTokenizer.from_pretrained('google/canine-c'); "
        "CanineModel.from_pretrained('google/canine-c'); "
        "print('CANINE cached')\"",
        # Pre-download SD v1.5 VAE (shared by all three models)
        "python -c \"from diffusers import AutoencoderKL; "
        "AutoencoderKL.from_pretrained('stable-diffusion-v1-5/stable-diffusion-v1-5', subfolder='vae'); "
        "print('SD VAE cached')\"",
        # Create weight directories for DiffBrush and One-DM (manual download targets)
        "mkdir -p /opt/DiffBrush/model_zoo",
        "mkdir -p /opt/One-DM/model_zoo",
    )
)

app = modal.App("annotation-agent-comparison", image=comparison_image)

# Volume for manually-uploaded weights (DiffBrush / One-DM)
weights_volume = modal.Volume.from_name("comparison-model-weights", create_if_missing=True)


# ---------------------------------------------------------------------------
# Test inputs (shared across all models)
# ---------------------------------------------------------------------------
TEST_WORDS = ["Hello", "Annotation", "handwriting"]
TEST_SENTENCE = "The quick brown fox jumps over the lazy dog"
TEST_PARAGRAPH = (
    "In this work we focus on generating authentic handwritten text "
    "that matches a specific writing style"
)


# ---------------------------------------------------------------------------
# Helper: assemble word images into lines (for word-level models)
# ---------------------------------------------------------------------------
def assemble_words_into_lines(word_images, gap=16, line_height=64, max_line_width=900):
    """Concatenate word PIL images into a multi-line paragraph image."""
    from PIL import Image

    lines = []
    current_line = []
    current_width = 0
    for img in word_images:
        if current_width + img.width + gap > max_line_width and current_line:
            lines.append(current_line)
            current_line = [img]
            current_width = img.width
        else:
            current_line.append(img)
            current_width += img.width + gap
    if current_line:
        lines.append(current_line)

    total_height = len(lines) * (line_height + 20)
    total_width = max_line_width
    result = Image.new("L", (total_width, total_height), 255)
    y_offset = 10
    for line in lines:
        x_offset = 10
        for img in line:
            gray = img.convert("L")
            result.paste(gray, (x_offset, y_offset))
            x_offset += gray.width + gap
        y_offset += line_height + 20
    return result


# ---------------------------------------------------------------------------
# Helper: convert tensor output to PIL
# ---------------------------------------------------------------------------
def tensor_to_pil(image_tensor):
    """Convert a [C, H, W] tensor in [0,1] range to PIL Image."""
    import torchvision
    return torchvision.transforms.ToPILImage()(image_tensor.cpu())


# ---------------------------------------------------------------------------
# Helper: image to PNG bytes
# ---------------------------------------------------------------------------
def pil_to_bytes(pil_img):
    from io import BytesIO
    buf = BytesIO()
    pil_img.save(buf, format="PNG")
    return buf.getvalue()


# ===================================================================
# MODEL 1: DiffusionPen
# ===================================================================
def run_diffusionpen(device):
    """Generate test samples with DiffusionPen. Returns dict of results."""
    import sys
    import time
    import random

    import torch
    import torchvision
    from diffusers import AutoencoderKL, DDIMScheduler
    from transformers import CanineModel, CanineTokenizer
    from huggingface_hub import hf_hub_download

    sys.path.insert(0, "/opt/DiffusionPen")
    from unet import UNetModel
    from feature_extractor import ImageEncoder

    print("\n" + "=" * 60)
    print("MODEL 1: DiffusionPen")
    print("=" * 60)

    style_classes = 339
    vocab_size = 80

    # Load models
    tokenizer = CanineTokenizer.from_pretrained("google/canine-c")
    text_encoder = CanineModel.from_pretrained("google/canine-c").to(device)
    text_encoder.eval()

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

    ckpt_path = hf_hub_download("konnik/DiffusionPen", "diffusionpen_iam_model_path/models/ema_ckpt.pt")
    state_dict = torch.load(ckpt_path, map_location=device)
    new_state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
    unet.load_state_dict(new_state_dict, strict=False)
    unet.eval()

    vae = AutoencoderKL.from_pretrained(
        "stable-diffusion-v1-5/stable-diffusion-v1-5", subfolder="vae"
    ).to(device)
    vae.eval()
    ddim = DDIMScheduler.from_pretrained(
        "stable-diffusion-v1-5/stable-diffusion-v1-5", subfolder="scheduler"
    )

    feature_extractor = ImageEncoder(
        model_name="mobilenetv2_100", num_classes=0, pretrained=True, trainable=True
    )
    style_path = hf_hub_download("konnik/DiffusionPen", "style_models/iam_style_diffusionpen.pth")
    style_state = torch.load(style_path, map_location=device)
    model_dict = feature_extractor.state_dict()
    style_state = {k: v for k, v in style_state.items() if k in model_dict and model_dict[k].shape == v.shape}
    model_dict.update(style_state)
    feature_extractor.load_state_dict(model_dict)
    feature_extractor = feature_extractor.to(device)
    feature_extractor.eval()

    print("  All DiffusionPen models loaded.")

    # --- Generation helper ---
    def generate_word(word, style_idx=None):
        if style_idx is None:
            style_idx = random.randint(0, style_classes - 1)
        labels = torch.tensor([style_idx]).long().to(device)
        context = tokenizer(
            word, return_tensors="pt", padding="max_length",
            max_length=40, truncation=True,
        )
        context = {k: v.to(device) for k, v in context.items()}

        dummy_style_imgs = torch.randn(5, 3, 64, 256, device=device)
        style_features = feature_extractor(dummy_style_imgs)

        noise = torch.randn((1, 4, 8, 32), device=device)
        ddim.set_timesteps(50)
        sample = noise

        with torch.no_grad():
            for t in ddim.timesteps:
                t_batch = torch.tensor([t], device=device).long()
                noise_pred = unet(
                    sample, t_batch,
                    context=context, y=labels,
                    style_extractor=style_features,
                )
                sample = ddim.step(noise_pred, t, sample).prev_sample

            sample = sample / vae.config.scaling_factor
            image = vae.decode(sample).sample
            image = ((image + 1) / 2).clamp(0, 1)

        return torchvision.transforms.ToPILImage()(image.squeeze(0).cpu())

    results = {"model": "diffusionpen", "words": {}, "sentences": {}, "timings": []}
    fixed_style = random.randint(0, style_classes - 1)

    # Single words
    for word in TEST_WORDS:
        start = time.time()
        try:
            img = generate_word(word, style_idx=fixed_style)
            elapsed = time.time() - start
            results["words"][word] = pil_to_bytes(img)
            results["timings"].append(elapsed)
            print(f"  '{word}': {elapsed:.2f}s ({img.width}x{img.height})")
        except Exception as e:
            elapsed = time.time() - start
            results["timings"].append(elapsed)
            print(f"  '{word}': FAILED - {e}")

    # Sentence (word-by-word assembly)
    sentence_words = TEST_SENTENCE.split()
    word_imgs = []
    start = time.time()
    for w in sentence_words:
        try:
            img = generate_word(w, style_idx=fixed_style)
            word_imgs.append(img)
        except Exception as e:
            print(f"  Sentence word '{w}': FAILED - {e}")
    if word_imgs:
        sentence_img = assemble_words_into_lines(word_imgs)
        results["sentences"]["quick_brown_fox"] = pil_to_bytes(sentence_img)
        elapsed = time.time() - start
        print(f"  Sentence ({len(sentence_words)} words): {elapsed:.2f}s")

    # Paragraph (word-by-word assembly)
    para_words = TEST_PARAGRAPH.split()
    word_imgs = []
    start = time.time()
    for w in para_words:
        try:
            img = generate_word(w, style_idx=fixed_style)
            word_imgs.append(img)
        except Exception as e:
            print(f"  Paragraph word '{w}': FAILED - {e}")
    if word_imgs:
        para_img = assemble_words_into_lines(word_imgs)
        results["sentences"]["paragraph"] = pil_to_bytes(para_img)
        elapsed = time.time() - start
        print(f"  Paragraph ({len(para_words)} words): {elapsed:.2f}s")

    # Cleanup GPU memory
    del unet, vae, text_encoder, feature_extractor, tokenizer
    torch.cuda.empty_cache()

    return results


# ===================================================================
# MODEL 2: DiffBrush
# ===================================================================
def run_diffbrush(device):
    """Generate test samples with DiffBrush. Returns dict of results or None."""
    import sys
    import os
    import time
    import pickle

    import torch
    import torchvision
    import numpy as np
    from diffusers import AutoencoderKL

    # Check for weights
    weight_path = "/volumes/weights/diffbrush/diffbrush_ckpt.pt"
    if not os.path.exists(weight_path):
        print("\n" + "=" * 60)
        print("MODEL 2: DiffBrush — SKIPPED (weights not found)")
        print("=" * 60)
        print("  To enable DiffBrush, upload weights to the Modal volume:")
        print("  1. Download from: https://drive.google.com/file/d/1EWzBmLtnQ42cTf3k_CYQ-nF3RXCb35I6")
        print("  2. Upload to Modal volume 'comparison-model-weights' at:")
        print(f"     diffbrush/diffbrush_ckpt.pt")
        print("  Example:")
        print("    modal volume put comparison-model-weights ./diffbrush_ckpt.pt diffbrush/diffbrush_ckpt.pt")
        return None

    print("\n" + "=" * 60)
    print("MODEL 2: DiffBrush")
    print("=" * 60)

    sys.path.insert(0, "/opt/DiffBrush")
    from models.unet import UNetModel
    from models.diffusion import Diffusion

    # DiffBrush config values (from configs/IAM.yml)
    emb_dim = 512
    in_channels = 4
    out_channels = 4
    num_res_blocks = 1
    num_heads = 4
    nb_classes = 496  # WRITER_NUMS in generate.py
    fixed_len = 1024

    # Letters mapping (from data_loader/IAMDataset.py)
    letters = " _!\"#&'()*+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    letter2index = {label: n for n, label in enumerate(letters)}

    # Load unifont symbols for content encoding
    unifont_path = "/opt/DiffBrush/files/unifont.pickle"
    with open(unifont_path, "rb") as f:
        symbols_raw = pickle.load(f)
    symbols = {sym["idx"][0]: sym["mat"].astype(np.float32) for sym in symbols_raw}
    con_symbols_list = []
    for char in letters:
        symbol = torch.from_numpy(symbols[ord(char)]).float()
        con_symbols_list.append(symbol)
    con_symbols_list.append(torch.zeros_like(con_symbols_list[0]))  # PAD_TOKEN
    con_symbols = torch.stack(con_symbols_list)

    def get_content(label):
        word_arch = [letter2index[c] for c in label]
        content_ref = con_symbols[word_arch]
        content_ref = 1.0 - content_ref
        return content_ref.unsqueeze(0)

    # Build model
    diffusion = Diffusion(device=device)
    unet = UNetModel(
        in_channels=in_channels, model_channels=emb_dim,
        out_channels=out_channels, num_res_blocks=num_res_blocks,
        attention_resolutions=(1, 1), channel_mult=(1, 1),
        num_heads=num_heads, context_dim=emb_dim,
        nb_classes=nb_classes,
    ).to(device)

    state_dict = torch.load(weight_path, map_location="cpu")
    unet.load_state_dict(state_dict)
    unet.eval()
    print("  DiffBrush UNet loaded.")

    vae = AutoencoderKL.from_pretrained(
        "stable-diffusion-v1-5/stable-diffusion-v1-5", subfolder="vae"
    ).to(device)
    vae.requires_grad_(False)

    print("  All DiffBrush models loaded.")

    results = {"model": "diffbrush", "words": {}, "sentences": {}, "timings": []}

    def generate_line(text):
        """Generate a full text line with DiffBrush."""
        # Content encoding
        content = get_content(text).to(device)  # [1, num_chars, H, W]

        # Dummy style reference (random, since we have no real IAM style images)
        # Style shape: [1, 1, 64, width] — single grayscale line image
        style_width = min(max(len(text) * 20, 256), 512)
        style_input = torch.ones(1, 1, 64, style_width, device=device)

        # Latent noise: [1, 4, H/8, fixed_len/8]
        x = torch.randn(
            (1, 4, style_input.shape[2] // 8, fixed_len // 8),
            device=device,
        )

        # DDIM sampling
        sampled = diffusion.ddim_sample(
            unet, vae, 1, x, style_input, content,
            sampling_timesteps=50, eta=0,
        )
        return tensor_to_pil(sampled[0])

    # Generate full sentence as a single line (DiffBrush advantage)
    start = time.time()
    try:
        # Filter to supported characters only
        filtered_sentence = "".join(c for c in TEST_SENTENCE if c in letter2index)
        img = generate_line(filtered_sentence)
        elapsed = time.time() - start
        results["sentences"]["quick_brown_fox"] = pil_to_bytes(img)
        results["timings"].append(elapsed)
        print(f"  Sentence (full line): {elapsed:.2f}s ({img.width}x{img.height})")
    except Exception as e:
        import traceback
        elapsed = time.time() - start
        results["timings"].append(elapsed)
        print(f"  Sentence: FAILED - {e}")
        traceback.print_exc()

    # Generate individual words for comparison
    for word in TEST_WORDS:
        start = time.time()
        try:
            filtered_word = "".join(c for c in word if c in letter2index)
            img = generate_line(filtered_word)
            elapsed = time.time() - start
            results["words"][word] = pil_to_bytes(img)
            results["timings"].append(elapsed)
            print(f"  '{word}': {elapsed:.2f}s ({img.width}x{img.height})")
        except Exception as e:
            elapsed = time.time() - start
            results["timings"].append(elapsed)
            print(f"  '{word}': FAILED - {e}")

    # Cleanup
    del unet, vae, diffusion
    torch.cuda.empty_cache()

    return results


# ===================================================================
# MODEL 3: One-DM
# ===================================================================
def run_one_dm(device):
    """Generate test samples with One-DM. Returns dict of results or None."""
    import sys
    import os
    import time
    import pickle

    import torch
    import torchvision
    import numpy as np
    from diffusers import AutoencoderKL

    # Check for weights
    weight_path = "/volumes/weights/one_dm/one_dm_ckpt.pt"
    if not os.path.exists(weight_path):
        print("\n" + "=" * 60)
        print("MODEL 3: One-DM — SKIPPED (weights not found)")
        print("=" * 60)
        print("  To enable One-DM, upload weights to the Modal volume:")
        print("  1. Download from: https://drive.google.com/drive/folders/10KOQ05HeN2kaR2_OCZNl9D_Kh1p8BDaa")
        print("     (file: One-DM-ckpt.pt)")
        print("  2. Upload to Modal volume 'comparison-model-weights' at:")
        print(f"     one_dm/one_dm_ckpt.pt")
        print("  Example:")
        print("    modal volume put comparison-model-weights ./One-DM-ckpt.pt one_dm/one_dm_ckpt.pt")
        return None

    print("\n" + "=" * 60)
    print("MODEL 3: One-DM")
    print("=" * 60)

    sys.path.insert(0, "/opt/One-DM")
    from models.unet import UNetModel
    from models.diffusion import Diffusion

    # One-DM config values (from configs/IAM64.yml)
    emb_dim = 512
    in_channels = 4
    out_channels = 4
    num_res_blocks = 1
    num_heads = 4

    # Letters mapping (from data_loader/loader.py)
    letters = '_Only thewigsofrcvdampbkuq.A-210xT5\'MDL,RYHJ"ISPWENj&BC93VGFKz();#:!7U64Q8?+*ZX/%'
    letter2index = {label: n for n, label in enumerate(letters)}

    # Load unifont symbols for content encoding
    # One-DM expects data/unifont.pickle relative to repo root
    unifont_path = "/opt/One-DM/data/unifont.pickle"
    if not os.path.exists(unifont_path):
        # Try copying from DiffBrush which has it
        diffbrush_unifont = "/opt/DiffBrush/files/unifont.pickle"
        if os.path.exists(diffbrush_unifont):
            os.makedirs("/opt/One-DM/data", exist_ok=True)
            import shutil
            shutil.copy2(diffbrush_unifont, unifont_path)
            print("  Copied unifont.pickle from DiffBrush repo.")
        else:
            print("  ERROR: unifont.pickle not found. Cannot run One-DM.")
            return None

    with open(unifont_path, "rb") as f:
        symbols_raw = pickle.load(f)
    symbols = {sym["idx"][0]: sym["mat"].astype(np.float32) for sym in symbols_raw}
    con_symbols_list = []
    for char in letters:
        symbol = torch.from_numpy(symbols[ord(char)]).float()
        con_symbols_list.append(symbol)
    con_symbols_list.append(torch.zeros_like(con_symbols_list[0]))  # PAD_TOKEN
    con_symbols = torch.stack(con_symbols_list)

    def get_content(label):
        word_arch = [letter2index[c] for c in label]
        content_ref = con_symbols[word_arch]
        content_ref = 1.0 - content_ref
        return content_ref.unsqueeze(0)

    # Build model
    diffusion = Diffusion(device=device)
    unet = UNetModel(
        in_channels=in_channels, model_channels=emb_dim,
        out_channels=out_channels, num_res_blocks=num_res_blocks,
        attention_resolutions=(1, 1), channel_mult=(1, 1),
        num_heads=num_heads, context_dim=emb_dim,
    ).to(device)

    state_dict = torch.load(weight_path, map_location="cpu")
    unet.load_state_dict(state_dict)
    unet.eval()
    print("  One-DM UNet loaded.")

    vae = AutoencoderKL.from_pretrained(
        "stable-diffusion-v1-5/stable-diffusion-v1-5", subfolder="vae"
    ).to(device)
    vae.requires_grad_(False)

    print("  All One-DM models loaded.")

    results = {"model": "one_dm", "words": {}, "sentences": {}, "timings": []}

    def generate_word(word):
        """Generate a single word with One-DM."""
        content = get_content(word).to(device)  # [1, num_chars, H, W]

        # One-DM uses one-shot style: a single reference image + its Laplacian
        # For eval without real style images, use dummy inputs
        style_width = 352  # style_len from loader.py
        style_input = torch.ones(1, 1, 64, style_width, device=device)
        laplace_input = torch.zeros(1, 1, 64, style_width, device=device)

        # Latent noise: [1, 4, H/8, (num_chars*32)/8]
        num_chars = len(word)
        latent_w = (num_chars * 32) // 8
        x = torch.randn((1, 4, 64 // 8, latent_w), device=device)

        # DDIM sampling
        sampled = diffusion.ddim_sample(
            unet, vae, 1, x, style_input, laplace_input, content,
            sampling_timesteps=50, eta=0,
        )
        return tensor_to_pil(sampled[0])

    # Single words
    for word in TEST_WORDS:
        start = time.time()
        try:
            filtered = "".join(c for c in word if c in letter2index)
            if not filtered:
                print(f"  '{word}': SKIPPED (no supported characters)")
                continue
            img = generate_word(filtered)
            elapsed = time.time() - start
            results["words"][word] = pil_to_bytes(img)
            results["timings"].append(elapsed)
            print(f"  '{word}': {elapsed:.2f}s ({img.width}x{img.height})")
        except Exception as e:
            import traceback
            elapsed = time.time() - start
            results["timings"].append(elapsed)
            print(f"  '{word}': FAILED - {e}")
            traceback.print_exc()

    # Sentence (word-by-word assembly, since One-DM is word-level)
    sentence_words = TEST_SENTENCE.split()
    word_imgs = []
    start = time.time()
    for w in sentence_words:
        try:
            filtered = "".join(c for c in w if c in letter2index)
            if filtered:
                img = generate_word(filtered)
                word_imgs.append(img)
        except Exception as e:
            print(f"  Sentence word '{w}': FAILED - {e}")
    if word_imgs:
        sentence_img = assemble_words_into_lines(word_imgs)
        results["sentences"]["quick_brown_fox"] = pil_to_bytes(sentence_img)
        elapsed = time.time() - start
        print(f"  Sentence ({len(sentence_words)} words): {elapsed:.2f}s")

    # Cleanup
    del unet, vae, diffusion
    torch.cuda.empty_cache()

    return results


# ===================================================================
# Main Modal function: run all models sequentially on the same GPU
# ===================================================================
@app.function(
    gpu="A10G",
    timeout=900,
    volumes={"/volumes/weights": weights_volume},
)
def run_comparison():
    """Run all three models and return comparison results."""
    import torch
    import time

    device = "cuda"
    print("=" * 60)
    print("HANDWRITING SYNTHESIS MODEL COMPARISON")
    print("=" * 60)
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print(f"Test words: {TEST_WORDS}")
    print(f"Test sentence: {TEST_SENTENCE}")
    print(f"Test paragraph: {TEST_PARAGRAPH[:60]}...")

    all_results = {}
    summary_lines = []

    # --- Model 1: DiffusionPen (always runs) ---
    t0 = time.time()
    try:
        dp_results = run_diffusionpen(device)
        all_results["diffusionpen"] = dp_results
        dp_time = time.time() - t0
        n_words = len(dp_results["words"])
        n_sentences = len(dp_results["sentences"])
        avg_time = (sum(dp_results["timings"]) / len(dp_results["timings"])
                    if dp_results["timings"] else 0)
        summary_lines.append(
            f"DiffusionPen: {n_words}/{len(TEST_WORDS)} words, "
            f"{n_sentences} assembled outputs, "
            f"avg {avg_time:.2f}s/word, total {dp_time:.1f}s"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        summary_lines.append(f"DiffusionPen: FAILED - {e}")

    # --- Model 2: DiffBrush (if weights available) ---
    t0 = time.time()
    try:
        db_results = run_diffbrush(device)
        if db_results:
            all_results["diffbrush"] = db_results
            db_time = time.time() - t0
            n_words = len(db_results["words"])
            n_sentences = len(db_results["sentences"])
            avg_time = (sum(db_results["timings"]) / len(db_results["timings"])
                        if db_results["timings"] else 0)
            summary_lines.append(
                f"DiffBrush:    {n_words}/{len(TEST_WORDS)} words, "
                f"{n_sentences} line outputs, "
                f"avg {avg_time:.2f}s/gen, total {db_time:.1f}s"
            )
        else:
            summary_lines.append("DiffBrush:    SKIPPED (weights not available)")
    except Exception as e:
        import traceback
        traceback.print_exc()
        summary_lines.append(f"DiffBrush:    FAILED - {e}")

    # --- Model 3: One-DM (if weights available) ---
    t0 = time.time()
    try:
        odm_results = run_one_dm(device)
        if odm_results:
            all_results["one_dm"] = odm_results
            odm_time = time.time() - t0
            n_words = len(odm_results["words"])
            n_sentences = len(odm_results["sentences"])
            avg_time = (sum(odm_results["timings"]) / len(odm_results["timings"])
                        if odm_results["timings"] else 0)
            summary_lines.append(
                f"One-DM:       {n_words}/{len(TEST_WORDS)} words, "
                f"{n_sentences} assembled outputs, "
                f"avg {avg_time:.2f}s/word, total {odm_time:.1f}s"
            )
        else:
            summary_lines.append("One-DM:       SKIPPED (weights not available)")
    except Exception as e:
        import traceback
        traceback.print_exc()
        summary_lines.append(f"One-DM:       FAILED - {e}")

    # Build summary text
    summary = "\n".join([
        "=" * 60,
        "COMPARISON SUMMARY",
        "=" * 60,
        "",
        *summary_lines,
        "",
        "Test inputs:",
        f"  Words: {TEST_WORDS}",
        f"  Sentence: {TEST_SENTENCE}",
        f"  Paragraph: {TEST_PARAGRAPH}",
        "",
        "Notes:",
        "  - DiffusionPen: word-level, assembled into sentences/paragraphs",
        "  - DiffBrush: full text-line generation (single forward pass per line)",
        "  - One-DM: word-level with one-shot style transfer",
        "  - All models use random/dummy style references for this eval",
        "    (real style images would improve output quality significantly)",
        "=" * 60,
    ])
    print("\n" + summary)

    all_results["summary"] = summary
    return all_results


# ---------------------------------------------------------------------------
# Local entrypoint: save results to disk
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main():
    import os

    print("Running handwriting synthesis comparison on A10G GPU...")
    results = run_comparison.remote()

    base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "eval_comparison")

    # Save per-model outputs
    for model_name in ["diffusionpen", "diffbrush", "one_dm"]:
        if model_name not in results:
            continue
        model_results = results[model_name]
        model_dir = os.path.join(base_dir, model_name)
        os.makedirs(model_dir, exist_ok=True)

        # Save word images
        for word, img_bytes in model_results.get("words", {}).items():
            fname = f"word_{word}.png"
            path = os.path.join(model_dir, fname)
            with open(path, "wb") as f:
                f.write(img_bytes)
            print(f"  Saved {model_name}/{fname}")

        # Save sentence/paragraph images
        for name, img_bytes in model_results.get("sentences", {}).items():
            fname = f"sentence_{name}.png" if name != "paragraph" else "paragraph.png"
            path = os.path.join(model_dir, fname)
            with open(path, "wb") as f:
                f.write(img_bytes)
            print(f"  Saved {model_name}/{fname}")

    # Save summary
    summary_path = os.path.join(base_dir, "comparison_summary.txt")
    os.makedirs(base_dir, exist_ok=True)
    with open(summary_path, "w") as f:
        f.write(results.get("summary", "No summary available"))
    print(f"\nSummary saved to: {summary_path}")
    print(f"Output directory: {base_dir}")

    # Print summary to console
    print("\n" + results.get("summary", ""))
