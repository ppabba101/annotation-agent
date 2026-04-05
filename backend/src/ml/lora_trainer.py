class LoRATrainer:
    """Placeholder for the LoRA fine-tuning trainer.

    Will fine-tune a diffusion model on handwriting samples
    using Low-Rank Adaptation (LoRA).
    """

    def train(self, style_id: str, sample_dir: str, output_dir: str) -> str:
        """Start a training run and return a checkpoint path."""
        raise NotImplementedError("LoRATrainer.train is not yet implemented")
