"""
DiffBrush Modal Inference Endpoint

Exposes a GPU-accelerated inference service for the DiffBrush handwriting
synthesis model. Runs on an A10G GPU with a 5-minute idle timeout to keep
the container warm between requests.

Model weights are loaded from Modal Volume "comparison-model-weights" at
path diffbrush/diffbrush_ckpt.pt. The SD v1.5 VAE is pre-cached in the
container image to avoid downloading at runtime.

Usage:
    modal run backend/src/ml/modal_inference.py
"""

import modal

# ---------------------------------------------------------------------------
# Container image
# ---------------------------------------------------------------------------
diffbrush_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.1.2",
        "torchvision==0.16.2",
        "diffusers==0.29.0",
        "safetensors==0.4.5",
        "accelerate",
        "einops==0.7.0",
        "omegaconf",
        "opencv-python-headless==4.9.0.80",
        "numpy==1.26.3",
        "Pillow==10.2.0",
        "pyyaml",
        "easydict",
    )
    .run_commands(
        # Clone DiffBrush source (models/unet.py, models/encoder.py, etc.)
        "git clone --depth 1 https://github.com/dailenson/DiffBrush.git /opt/DiffBrush",
        # Pre-cache SD v1.5 VAE so load_models() doesn't hit the network
        "python -c \""
        "from diffusers import AutoencoderKL; "
        "AutoencoderKL.from_pretrained("
        "'stable-diffusion-v1-5/stable-diffusion-v1-5', subfolder='vae'); "
        "print('SD v1.5 VAE cached')\"",
    )
)

app = modal.App("diffbrush-inference", image=diffbrush_image)

# Modal Volume that already contains diffbrush/diffbrush_ckpt.pt
vol = modal.Volume.from_name("comparison-model-weights", create_if_missing=False)

# ---------------------------------------------------------------------------
# DiffBrush config constants (from configs/IAM.yml and generate.py)
# ---------------------------------------------------------------------------
_EMB_DIM = 512
_IN_CHANNELS = 4
_OUT_CHANNELS = 4
_NUM_RES_BLOCKS = 1
_NUM_HEADS = 4
_WRITER_NUMS = 496   # nb_classes — used by UNet even in test mode
_FIXED_LEN = 1024   # output image width in pixels (→ 128 latent columns)
_IMG_H = 64          # output image height in pixels (→ 8 latent rows)

# IAM character set (from data_loader/IAMDataset.py)
_LETTERS = " _!\"#&'()*+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

# Checkpoint path inside the volume
_CKPT_PATH = "/models/diffbrush/diffbrush_ckpt.pt"

# unifont.pickle is bundled inside the cloned repo
_UNIFONT_PATH = "/opt/DiffBrush/files/unifont.pickle"


# ---------------------------------------------------------------------------
# Inference class
# ---------------------------------------------------------------------------
@app.cls(
    gpu="A10G",
    volumes={"/models": vol},
    scaledown_window=300,  # keep container warm for 5 minutes
)
class DiffBrushInference:
    """
    GPU inference service for the DiffBrush handwriting synthesis model.

    The container loads the UNet, VAE, Diffusion scheduler, and unifont
    glyph table once on startup (@modal.enter) and reuses them across calls.
    """

    @modal.enter()
    def load_models(self):
        """
        Load all model components into GPU memory.

        Called once when the container starts.  Subsequent method calls on
        the same warm container skip this entirely.
        """
        import sys
        import pickle

        import torch
        import numpy as np
        from diffusers import AutoencoderKL

        # Make DiffBrush source importable
        sys.path.insert(0, "/opt/DiffBrush")
        from models.unet import UNetModel
        from models.diffusion import Diffusion

        self.device = "cuda"
        self.letter2index = {ch: idx for idx, ch in enumerate(_LETTERS)}

        # --- unifont glyph table -----------------------------------------
        # symbols_raw: list of dicts with keys "idx" (unicode codepoint) and
        # "mat" (16×16 float array representing the glyph bitmap).
        with open(_UNIFONT_PATH, "rb") as fh:
            symbols_raw = pickle.load(fh)

        symbols = {sym["idx"][0]: sym["mat"].astype(np.float32) for sym in symbols_raw}

        # Build a [num_letters + 1, 16, 16] tensor; last entry is the PAD token
        import torch as _torch
        con_symbols_list = []
        for char in _LETTERS:
            glyph = _torch.from_numpy(symbols[ord(char)]).float()
            con_symbols_list.append(glyph)
        con_symbols_list.append(_torch.zeros_like(con_symbols_list[0]))  # PAD_TOKEN
        self.con_symbols = _torch.stack(con_symbols_list)  # [N+1, 16, 16]

        # --- UNet -----------------------------------------------------------
        # Signature from generate.py (line ~41).  The checkpoint was saved
        # with DataParallel so keys have a "module." prefix — strip them.
        unet = UNetModel(
            in_channels=_IN_CHANNELS,
            model_channels=_EMB_DIM,
            out_channels=_OUT_CHANNELS,
            num_res_blocks=_NUM_RES_BLOCKS,
            attention_resolutions=(1, 1),
            channel_mult=(1, 1),
            num_heads=_NUM_HEADS,
            context_dim=_EMB_DIM,
            nb_classes=_WRITER_NUMS,
        ).to(self.device)

        state_dict = torch.load(_CKPT_PATH, map_location="cpu")
        # Strip DataParallel "module." prefix if present
        state_dict = {
            k.replace("module.", ""): v for k, v in state_dict.items()
        }
        unet.load_state_dict(state_dict, strict=False)
        unet.eval()
        self.unet = unet
        print(f"[DiffBrushInference] UNet loaded from {_CKPT_PATH}")

        # --- VAE ------------------------------------------------------------
        # Pre-cached in the image; no network access needed at runtime.
        vae = AutoencoderKL.from_pretrained(
            "stable-diffusion-v1-5/stable-diffusion-v1-5",
            subfolder="vae",
        ).to(self.device)
        vae.requires_grad_(False)
        self.vae = vae
        print("[DiffBrushInference] VAE loaded")

        # --- DDIM diffusion scheduler ---------------------------------------
        self.diffusion = Diffusion(device=self.device)
        print("[DiffBrushInference] Diffusion scheduler ready")

    # -----------------------------------------------------------------------
    # Internal helpers (not exposed as Modal methods)
    # -----------------------------------------------------------------------

    def _get_content(self, text: str):
        """
        Convert a text string to a content tensor.

        Follows the logic in base_dataset.py::get_content():
          1. Map each character to its index in _LETTERS.
          2. Look up the 16×16 glyph bitmap for each character.
          3. Invert the bitmaps (1.0 - ref) so ink is 1, paper is 0.
          4. Return shape [1, T, 16, 16].

        Characters not in _LETTERS are silently dropped.
        """
        import torch

        filtered = [ch for ch in text if ch in self.letter2index]
        if not filtered:
            raise ValueError(
                f"Text {text!r} contains no characters from the supported charset."
            )
        indices = [self.letter2index[ch] for ch in filtered]
        content_ref = self.con_symbols[indices]   # [T, 16, 16]
        content_ref = 1.0 - content_ref           # invert: ink=1, paper=0
        return content_ref.unsqueeze(0)           # [1, T, 16, 16]

    def _preprocess_style_image(self, image_bytes: bytes):
        """
        Preprocess a handwriting reference image for use as DiffBrush style input.

        Follows the logic in base_dataset.py::get_style_ref():
          - Load as grayscale, normalize to [0, 1]
          - Pad width to at least 512 px with 1.0 (white)
          - Return shape [1, 1, H, W] as a float32 tensor

        Args:
            image_bytes: Raw bytes of a PNG/JPEG grayscale handwriting image.

        Returns:
            torch.Tensor of shape [1, 1, H, W], values in [0, 1].
        """
        import io

        import cv2
        import numpy as np
        import torch
        from PIL import Image

        # Decode image → grayscale numpy array
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("L")
        img_np = np.array(pil_img, dtype=np.float32) / 255.0  # H×W, [0,1]

        h, w = img_np.shape
        # Pad width to at least 512 with white (1.0)
        target_w = max(w, 512)
        if w < target_w:
            padded = np.ones((h, target_w), dtype=np.float32)
            padded[:, :w] = img_np
            img_np = padded

        # Shape: [1, 1, H, W]
        style_tensor = torch.from_numpy(img_np).unsqueeze(0).unsqueeze(0)
        return style_tensor

    def _tensor_to_png_bytes(self, image_tensor) -> bytes:
        """
        Convert a [C, H, W] tensor in [0, 1] range to PNG bytes.

        The output is saved as a grayscale PNG (mode "L") to match the
        convention used in the original generate.py evaluation script.
        """
        import io

        import torchvision

        pil_img = torchvision.transforms.ToPILImage()(image_tensor.cpu())
        pil_img = pil_img.convert("L")  # grayscale, consistent with generate.py
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        return buf.getvalue()

    def _run_inference(self, text: str, style_tensor) -> bytes:
        """
        Core inference: encode content, run DDIM sampling, return PNG bytes.

        Args:
            text:          The text string to render (unsupported chars dropped).
            style_tensor:  Preprocessed style tensor [1, 1, H, W] on CPU.

        Returns:
            PNG bytes of the generated 64×1024 handwriting image.
        """
        import torch

        content = self._get_content(text).to(self.device)    # [1, T, 16, 16]
        style_input = style_tensor.to(self.device)            # [1, 1, H, W]

        # Latent noise: [B, 4, IMG_H/8, FIXED_LEN/8] = [1, 4, 8, 128]
        x = torch.randn(
            (1, 4, _IMG_H // 8, _FIXED_LEN // 8),
            device=self.device,
        )

        # DDIM sampling — returns [B, C, H, W] in [0, 1]
        sampled = self.diffusion.ddim_sample(
            self.unet,
            self.vae,
            n=1,
            x=x,
            styles=style_input,
            content=content,
            sampling_timesteps=50,
            eta=0,
        )
        # sampled: [1, 3, 64, 1024]
        return self._tensor_to_png_bytes(sampled[0])

    # -----------------------------------------------------------------------
    # Public Modal methods
    # -----------------------------------------------------------------------

    @modal.method()
    def generate_line(self, text: str, style_image_bytes: bytes) -> bytes:
        """
        Generate a single handwriting line for the given text.

        The model always outputs a fixed 64×1024 image regardless of text
        length — shorter texts will have trailing whitespace in the output.

        Args:
            text:              Text to render.  Characters outside the IAM
                               charset are silently dropped.
            style_image_bytes: PNG/JPEG bytes of a reference handwriting
                               image used to condition the writing style.

        Returns:
            PNG bytes of the generated 64×1024 grayscale image.
        """
        style_tensor = self._preprocess_style_image(style_image_bytes)
        return self._run_inference(text, style_tensor)

    @modal.method()
    def generate_lines_batch(
        self,
        texts: list,
        style_image_bytes: bytes,
    ) -> list:
        """
        Generate multiple handwriting lines with the same style reference.

        Preprocessing the style image once and reusing it across all texts
        is more efficient than calling generate_line() in a loop.

        Args:
            texts:             List of text strings to render.
            style_image_bytes: Shared style reference image (PNG/JPEG bytes).

        Returns:
            List of PNG bytes, one per input text, in the same order.
        """
        style_tensor = self._preprocess_style_image(style_image_bytes)
        results = []
        for text in texts:
            try:
                png_bytes = self._run_inference(text, style_tensor)
                results.append(png_bytes)
            except Exception as exc:
                # Propagate a clear error rather than silently skipping
                raise RuntimeError(
                    f"generate_lines_batch failed on text {text!r}: {exc}"
                ) from exc
        return results

    @modal.method()
    def encode_style(self, image_bytes: bytes) -> bytes:
        """
        Preprocess a handwriting sample image and return the serialized tensor.

        This is useful when you want to preprocess a style image once and
        pass the result to multiple generate_line() calls without re-running
        the image decoding + normalization step on each call.

        The preprocessing matches base_dataset.py::get_style_ref():
          - Grayscale, normalized to [0, 1]
          - Width padded to >= 512 with white (1.0)
          - Output shape: [1, 1, H, W]

        Args:
            image_bytes: Raw PNG/JPEG bytes of a handwriting sample.

        Returns:
            Serialized tensor bytes (via torch.save → BytesIO).  Pass these
            bytes directly to _preprocess_style_image is NOT needed; call
            encode_style() only for caching/inspection purposes.
        """
        import io

        import torch

        style_tensor = self._preprocess_style_image(image_bytes)
        buf = io.BytesIO()
        torch.save(style_tensor, buf)
        return buf.getvalue()


# ---------------------------------------------------------------------------
# Local entrypoint for smoke-testing: modal run backend/src/ml/modal_inference.py
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main():
    """
    Smoke-test the inference endpoint with a dummy white-page style image.

    Saves the generated PNG to backend/src/ml/test_output_diffbrush.png
    so you can visually inspect the output locally.
    """
    import io
    import os

    from PIL import Image

    print("Running DiffBrush smoke test on Modal A10G...")

    # Create a minimal 64×512 white style image (blank page)
    dummy_style = Image.new("L", (512, 64), color=255)
    buf = io.BytesIO()
    dummy_style.save(buf, format="PNG")
    style_bytes = buf.getvalue()

    test_texts = [
        "Hello world",
        "The quick brown fox",
    ]

    service = DiffBrushInference()

    # Single line
    print(f"\nGenerating single line: {test_texts[0]!r}")
    png_bytes = service.generate_line.remote(test_texts[0], style_bytes)
    out_path = os.path.join(os.path.dirname(__file__), "test_output_diffbrush.png")
    with open(out_path, "wb") as fh:
        fh.write(png_bytes)
    img = Image.open(io.BytesIO(png_bytes))
    print(f"  Output: {img.width}x{img.height} px  →  {out_path}")

    # Batch
    print(f"\nGenerating batch of {len(test_texts)} lines...")
    batch_results = service.generate_lines_batch.remote(test_texts, style_bytes)
    for text, result_bytes in zip(test_texts, batch_results):
        img = Image.open(io.BytesIO(result_bytes))
        print(f"  {text!r}: {img.width}x{img.height} px")

    # encode_style round-trip
    print("\nTesting encode_style...")
    encoded = service.encode_style.remote(style_bytes)
    print(f"  Serialized tensor size: {len(encoded)} bytes")

    print("\nSmoke test complete.")
