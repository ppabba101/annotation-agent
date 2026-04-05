class AnnotationGenerator:
    """Placeholder for the handwriting annotation generator.

    Will render annotation overlays (highlight, underline, circle,
    arrow, margin note) in the target handwriting style.
    """

    def generate(
        self,
        annotation_type: str,
        region: dict,
        style_id: str,
        text: str | None = None,
    ) -> str:
        """Generate an annotation overlay and return the output image path."""
        raise NotImplementedError(
            "AnnotationGenerator.generate is not yet implemented"
        )
