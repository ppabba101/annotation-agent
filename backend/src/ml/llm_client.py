"""Claude API client for content analysis and annotation planning."""
from __future__ import annotations

import json
import logging
import os

from anthropic import Anthropic

logger = logging.getLogger(__name__)

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY environment variable not set. "
                "Set it to your Anthropic API key to enable AI annotation."
            )
        _client = Anthropic(api_key=api_key)
    return _client


ANNOTATION_SYSTEM_PROMPT = """\
You are an expert student annotator. Given extracted text from a textbook page with word-level position data, you produce a structured annotation plan.

Your annotations should look like a thoughtful student studied this material:
- Highlight key definitions, theorems, and important facts
- Write concise margin notes summarizing key concepts
- Circle critical terms
- Underline important phrases
- Draw arrows connecting related concepts

IMPORTANT: For highlights, underlines, and circles, you MUST quote the EXACT text from the page that should be annotated. The system will search for this exact text to find its position.

For margin notes, specify which paragraph the note should appear near.

Adapt annotation density to content difficulty:
- Dense/complex sections: more annotations
- Simple/introductory sections: fewer annotations

Return ONLY valid JSON matching this schema:
{
  "annotations": [
    {
      "type": "highlight",
      "target_text": "exact text to highlight from the page",
      "color": "yellow"
    },
    {
      "type": "underline",
      "target_text": "exact text to underline"
    },
    {
      "type": "circle",
      "target_text": "exact term to circle"
    },
    {
      "type": "margin_note",
      "near_paragraph": 2,
      "text": "Concise note about the concept"
    },
    {
      "type": "arrow",
      "from_text": "source term",
      "to_text": "target term or definition"
    }
  ]
}

Colors for highlights: "yellow", "green", "pink", "blue". Default is "yellow".
"""


def analyze_page_for_annotations(
    page_text_blocks: list[dict],
    context: str | None = None,
) -> list[dict]:
    """Send page text to Claude and get back semantic annotation plan.

    Args:
        page_text_blocks: List of {"text": str, "bbox": [x0, y0, x1, y1], "block": int, "line": int}
        context: Optional user context ("studying for biology exam", etc.)

    Returns:
        List of annotation dicts with semantic references (not pixel coords)
    """
    client = _get_client()

    # Format text blocks for Claude
    formatted = []
    for i, block in enumerate(page_text_blocks):
        formatted.append(f"[Paragraph {i}] {block['text']}")

    page_content = "\n\n".join(formatted)

    user_msg = f"Analyze this textbook page and create an annotation plan:\n\n{page_content}"
    if context:
        user_msg = f"Context: {context}\n\n{user_msg}"

    logger.info("Sending %d text blocks to Claude for annotation analysis", len(page_text_blocks))

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=ANNOTATION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    # Parse the JSON response
    text = response.content[0].text
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]

    try:
        result = json.loads(text)
        annotations = result.get("annotations", [])
        logger.info("Claude returned %d annotations", len(annotations))
        return annotations
    except json.JSONDecodeError:
        logger.error("Failed to parse Claude response as JSON: %s", text[:200])
        return []
