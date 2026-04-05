class StyleEncoder:
    """Placeholder for the handwriting style encoder.

    Will encode reference samples into a style embedding vector
    that conditions the generation model.
    """

    def encode(self, sample_paths: list[str]) -> list[float]:
        """Return a style embedding from a list of sample image paths."""
        raise NotImplementedError("StyleEncoder.encode is not yet implemented")
