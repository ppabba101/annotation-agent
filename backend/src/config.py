from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ANNOTATION_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    HOST: str = "127.0.0.1"
    PORT: int = 8000
    UPLOAD_DIR: str = "data/samples"
    MODELS_DIR: str = "data/models"
    MAX_SAMPLE_SIZE_MB: int = 50
    GPU_PROVIDER: str = "modal"  # "modal" | "runpod" | "local"
    STYLES_DIR: str = "data/styles"
    DIFFBRUSH_SAMPLING_STEPS: int = 50
    MODAL_APP_NAME: str = "diffbrush-inference"


settings = Settings()
