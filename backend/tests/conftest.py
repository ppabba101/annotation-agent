import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
