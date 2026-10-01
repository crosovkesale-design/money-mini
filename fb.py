import httpx
from typing import Any


class Firebase:
    """Async REST-клиент для Firebase RTDB."""

    def __init__(self, url: str, timeout: float = 10.0):
        self.url = url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _c(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _u(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return self.url + path + ".json"

    async def get(self, path: str) -> Any:
        c = await self._c()
        r = await c.get(self._u(path))
        r.raise_for_status()
        return r.json()

    async def put(self, path: str, data: Any) -> None:
        c = await self._c()
        r = await c.put(self._u(path), json=data)
        r.raise_for_status()

    async def patch(self, path: str, data: dict) -> None:
        c = await self._c()
        r = await c.patch(self._u(path), json=data)
        r.raise_for_status()

    async def delete(self, path: str) -> None:
        c = await self._c()
        r = await c.delete(self._u(path))
        r.raise_for_status()

    async def push(self, path: str, data: dict) -> str:
        """Возвращает сгенерированный ключ (аналог POST в RTDB)."""
        c = await self._c()
        r = await c.post(self._u(path), json=data)
        r.raise_for_status()
        return r.json().get("name", "")
