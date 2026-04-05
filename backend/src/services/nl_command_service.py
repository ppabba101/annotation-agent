class NLCommandService:
    async def parse(self, command: str, canvas_state: dict | None) -> list[dict]:
        """Parse a natural-language command into a structured action list.

        Stub implementation — a real version would call an LLM.
        """
        # Return a minimal echo action so the endpoint is functional
        return [
            {
                "action": "echo",
                "raw_command": command,
                "canvas_state_received": canvas_state is not None,
            }
        ]
